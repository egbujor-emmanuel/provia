import sys, json, re, binascii, subprocess, tempfile, os
def certs_from_quote(hexq):
    b = binascii.unhexlify(hexq[2:] if hexq.startswith('0x') else hexq)
    txt = b.decode('latin1')
    pems = re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', txt, re.S)
    return b, pems
def describe(pem):
    with tempfile.NamedTemporaryFile('w', delete=False, suffix='.pem') as f: f.write(pem); n=f.name
    out = subprocess.run(['openssl','x509','-in',n,'-noout','-subject','-issuer'],capture_output=True,text=True).stdout
    os.unlink(n); return out.strip().replace('\n',' || ')
src = sys.argv[1]; hexq = sys.argv[2] if len(sys.argv)>2 else None
if hexq is None:
    d = json.load(open(src)); hexq = d['proof']
b, pems = certs_from_quote(hexq)
print(f"[{src}] quote bytes={len(b)} version={int.from_bytes(b[0:2],'little')} tee_type=0x{int.from_bytes(b[4:8],'little'):x} (0x81=TDX)")
for i,p in enumerate(pems): print(f"  cert{i}: {describe(p)}")
