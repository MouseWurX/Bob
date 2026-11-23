# Brain Engine 0044: q3_0's faster unpacking in the CUDA flash-attention kernel gives the very same codes as 0038's.
# Built and run on the processor (the bit tricks are plain integer code), so it needs only a C++ compiler.
# usage: kv-q3-fast.py [llama.cpp checkout with 0044]
import os, subprocess, sys, tempfile
CODE = r'''
#include <cstdio>
#include <cstdint>
static int old_v(int lo, int hi){ return ((lo)&3)|(((hi)&1)<<2) | ((lo>>2)&3)<<8|(((hi>>1)&1)<<10) | ((lo>>4)&3)<<16|(((hi>>2)&1)<<18) | ((lo>>6)&3)<<24|(((hi>>3)&1)<<26); }
static inline int spread_lo(int x){ x &= 0xFF; x = (x | (x << 12)) & 0x000F000F; return (x | (x << 6)) & 0x03030303; }
static inline int spread_hi(int x){ x &= 0xF; x = (x | (x << 14)) & 0x00030003; return (x | (x << 7)) & 0x01010101; }
int main(){
  int bad=0;
  for(int lo=0;lo<256;lo++) for(int hi=0;hi<16;hi++) if(old_v(lo,hi)!=(spread_lo(lo)|(spread_hi(hi)<<2))) bad++;
  uint32_t seed=1; int badv=0;
  for(int t=0;t<20000;t++){ uint8_t qs[8]; uint32_t qh; for(int i=0;i<8;i++){seed=seed*1103515245+12345; qs[i]=seed>>16;} seed=seed*1103515245+12345; qh=seed; seed=seed*1103515245+12345; qh^=seed<<16;
    for(int ne=2;ne<=4;ne+=2) for(int j0=0;j0<32;j0+=ne){
      int lo=qs[j0/4]>>(2*(j0%4)); int q=spread_lo(lo)|(spread_hi((int)(qh>>j0))<<2);
      for(int l=0;l<ne;l++){int j=j0+l; int c=((qs[j/4]>>(2*(j%4)))&3)|(((qh>>j)&1)<<2); if((int8_t)(c-4)!=(int8_t)(((q>>(8*l))&0xFF)-4)) badv++;} } }
  printf("%d %d\n",bad,badv); return 0; }
'''
fails = 0
def check(name, ok, why=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + name + (f' ({why})' if why and not ok else ''))
    fails += not ok
d = tempfile.mkdtemp(prefix='kvq3-')
src, exe = os.path.join(d, 'eq.cpp'), os.path.join(d, 'eq')
open(src, 'w').write(CODE)
subprocess.run(['g++', '-O2', src, '-o', exe], check=True)
k, v = map(int, subprocess.run([exe], capture_output=True, text=True, check=True).stdout.split())
check('K: the same codes as 0038 for every low/high input', k == 0, f'{k} differ')
check('V: the same codes for every aligned start, ne 2 and 4, in 20,000 random blocks', v == 0, f'{v} differ')
if len(sys.argv) > 1:
    with open(os.path.join(sys.argv[1], 'ggml/src/ggml-cuda/fattn-common.cuh'), encoding='utf8') as f: t = f.read()
    # the kernel uses the same two spreads as checked above
    check('the kernel has both spreads', 'x = (x | (x << 12)) & 0x000F000F;' in t and 'x = (x | (x << 14)) & 0x00030003;' in t and '__vsub4(q, 0x04040404)' in t)
print('ALL PASS' if not fails else f'{fails} FAILED')
sys.exit(1 if fails else 0)
