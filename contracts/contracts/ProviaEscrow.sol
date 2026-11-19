// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice zkVerify's aggregation verifier, deployed on each supported chain.
interface IVerifyProofAggregation {
    function verifyProofAggregation(
        uint256 domainId,
        uint256 aggregationId,
        bytes32 leaf,
        bytes32[] calldata merklePath,
        uint256 leafCount,
        uint256 index
    ) external view returns (bool);
}

/// @title ProviaEscrow
/// @notice Holds a seller's tokens until zkVerify attests a Groth16 proof that the buyer's
/// fiat payment cleared under the trade's release policy (PRD §3, §6).
/// The leaf is always rebuilt here from the public inputs; a caller-supplied leaf is never trusted.
contract ProviaEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant PROVING_SYSTEM_ID = keccak256(abi.encodePacked("groth16"));
    bytes32 public constant VERSION_HASH = sha256(abi.encodePacked(""));
    uint256 internal constant SNARK_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416711303009522949311349895999 + 618;

    IVerifyProofAggregation public immutable zkVerify;
    bytes32 public immutable vkHash;
    IERC20 public immutable token;

    enum State { None, Locked, Released, Refunded }

    struct Trade {
        address seller;
        address recipient;
        uint256 tokenAmount;
        uint64 priceKobo;
        uint64 deadline;
        State state;
    }

    struct Attestation {
        uint256 domainId;
        uint256 aggregationId;
        bytes32[] merklePath;
        uint256 leafCount;
        uint256 index;
    }

    mapping(uint256 => Trade) public trades;
    mapping(uint256 => bool) public nullifierUsed;

    error TradeExists();
    error InvalidTrade();
    error TradeNotLocked();
    error NotSeller();
    error DeadlinePassed();
    error DeadlineNotReached();
    error NullifierReused();
    error InputOutOfField();
    error ProofNotAttested();

    event TradeLocked(uint256 indexed tradeId, address indexed seller, address recipient, uint256 tokenAmount, uint64 priceKobo, uint64 deadline);
    event Released(uint256 indexed tradeId, address indexed recipient, uint256 tokenAmount, uint256 nullifier, bytes32 claimCommit, bytes32 leaf, uint256 aggregationId);
    event Refunded(uint256 indexed tradeId, address indexed seller, uint256 tokenAmount);

    constructor(IVerifyProofAggregation zkVerify_, bytes32 vkHash_, IERC20 token_) {
        zkVerify = zkVerify_;
        vkHash = vkHash_;
        token = token_;
    }

    /// @notice Seller locks tokens for a trade. tradeId must be unique and non-zero.
    function lock(uint256 tradeId, address recipient, uint256 tokenAmount, uint64 priceKobo, uint64 deadline)
        external
        nonReentrant
    {
        if (trades[tradeId].state != State.None) revert TradeExists();
        if (tradeId == 0 || tradeId >= SNARK_SCALAR_FIELD) revert InvalidTrade();
        if (recipient == address(0) || tokenAmount == 0 || priceKobo == 0) revert InvalidTrade();
        if (deadline <= block.timestamp) revert DeadlinePassed();

        trades[tradeId] = Trade(msg.sender, recipient, tokenAmount, priceKobo, deadline, State.Locked);
        token.safeTransferFrom(msg.sender, address(this), tokenAmount);
        emit TradeLocked(tradeId, msg.sender, recipient, tokenAmount, priceKobo, deadline);
    }

    /// @notice Anyone may trigger release; funds can only go to the trade's recipient.
    /// @param nullifier Poseidon(paystack reference), the circuit's public output.
    /// @param claimCommit Poseidon commitment to the zkTLS-revealed payment fields.
    function release(uint256 tradeId, uint256 nullifier, uint256 claimCommit, Attestation calldata att)
        external
        nonReentrant
    {
        Trade storage t = trades[tradeId];
        if (t.state != State.Locked) revert TradeNotLocked();
        if (nullifierUsed[nullifier]) revert NullifierReused();
        if (nullifier >= SNARK_SCALAR_FIELD || claimCommit >= SNARK_SCALAR_FIELD) revert InputOutOfField();

        bytes32 leaf = statementLeaf(tradeId, uint256(uint160(t.recipient)), t.priceKobo, t.deadline, nullifier, claimCommit);
        bool ok = zkVerify.verifyProofAggregation(att.domainId, att.aggregationId, leaf, att.merklePath, att.leafCount, att.index);
        if (!ok) revert ProofNotAttested();

        nullifierUsed[nullifier] = true;
        t.state = State.Released;
        token.safeTransfer(t.recipient, t.tokenAmount);
        emit Released(tradeId, t.recipient, t.tokenAmount, nullifier, bytes32(claimCommit), leaf, att.aggregationId);
    }

    /// @notice After the deadline, an unreleased trade returns to the seller.
    function refund(uint256 tradeId) external nonReentrant {
        Trade storage t = trades[tradeId];
        if (t.state != State.Locked) revert TradeNotLocked();
        if (msg.sender != t.seller) revert NotSeller();
        if (block.timestamp <= t.deadline) revert DeadlineNotReached();

        t.state = State.Refunded;
        token.safeTransfer(t.seller, t.tokenAmount);
        emit Refunded(tradeId, t.seller, t.tokenAmount);
    }

    /// @notice zkVerify statement leaf for a Groth16 proof of release_policy.circom.
    /// Public signal order (snarkjs): nullifier, tradeId, recipient, priceKobo, deadline, claimCommit.
    /// zkVerify hashes each public signal as 32-byte little-endian, concatenated (groth16 pallet `pubs_bytes`).
    function statementLeaf(
        uint256 tradeId,
        uint256 recipient,
        uint256 priceKobo,
        uint256 deadline,
        uint256 nullifier,
        uint256 claimCommit
    ) public view returns (bytes32) {
        bytes32 pubsHash = keccak256(
            abi.encodePacked(
                _toLittleEndian(nullifier),
                _toLittleEndian(tradeId),
                _toLittleEndian(recipient),
                _toLittleEndian(priceKobo),
                _toLittleEndian(deadline),
                _toLittleEndian(claimCommit)
            )
        );
        return keccak256(abi.encodePacked(PROVING_SYSTEM_ID, vkHash, VERSION_HASH, pubsHash));
    }

    /// @dev Reverses the byte order of a 256-bit word. (The zkVerify docs' snippet has
    /// corrupted shift amounts of 1/2/3/4; the correct shifts are 8/16/32/64/128.)
    function _toLittleEndian(uint256 input) internal pure returns (uint256 v) {
        v = input;
        v = ((v & 0xFF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00) >> 8)
            | ((v & 0x00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF00FF) << 8);
        v = ((v & 0xFFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000) >> 16)
            | ((v & 0x0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF0000FFFF) << 16);
        v = ((v & 0xFFFFFFFF00000000FFFFFFFF00000000FFFFFFFF00000000FFFFFFFF00000000) >> 32)
            | ((v & 0x00000000FFFFFFFF00000000FFFFFFFF00000000FFFFFFFF00000000FFFFFFFF) << 32);
        v = ((v & 0xFFFFFFFFFFFFFFFF0000000000000000FFFFFFFFFFFFFFFF0000000000000000) >> 64)
            | ((v & 0x0000000000000000FFFFFFFFFFFFFFFF0000000000000000FFFFFFFFFFFFFFFF) << 64);
        v = (v >> 128) | (v << 128);
    }
}
