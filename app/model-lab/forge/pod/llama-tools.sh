#!/bin/bash
# Gets llama.cpp's converter (python) and llama-quantize (binary) ready in $1 (the work dir), tag $2.
# Never fatal: writes $1/llama-ready or $1/llama-failed. The forge waits for one of them before the export step.
W=$1; TAG=${2:-b11669}; L=$W/llama.cpp; B=$L/build/bin
fetch() { python3 -c "import sys,urllib.request,shutil; r=urllib.request.Request(sys.argv[1], headers={'User-Agent':'bob-forge/1.0'}); shutil.copyfileobj(urllib.request.urlopen(r, timeout=120), open(sys.argv[2],'wb'))" "$1" "$2"; }
works() { ( cd "$(dirname "$1")" && LD_LIBRARY_PATH="$(dirname "$1"):${LD_LIBRARY_PATH:-}" "$1" 2>&1 | head -5 | grep -qi "usage" ); }
rm -f $W/llama-ready $W/llama-failed
if [ ! -f $L/convert_hf_to_gguf.py ]; then
  fetch "https://github.com/ggml-org/llama.cpp/archive/refs/tags/$TAG.tar.gz" $W/llsrc.tgz || { echo "source download failed"; touch $W/llama-failed; exit 1; }
  mkdir -p $L && tar xzf $W/llsrc.tgz -C $L --strip-components=1 --no-same-owner
fi
[ -f $L/convert_hf_to_gguf.py ] || { echo "no converter in the source"; touch $W/llama-failed; exit 1; }
# NOT the repo's requirements file: it pins torch and transformers to old versions and would wreck vLLM and the heal.
pip install -q sentencepiece "protobuf>=4.21,<5" 2>&1 | tail -1
python3 -c "import sys; sys.path.insert(0, '$L/gguf-py'); import gguf; print('gguf-py ok')" || pip install -q gguf 2>&1 | tail -1
mkdir -p $B
if ! works $B/llama-quantize; then
  # 1) prebuilt binaries
  if fetch "https://github.com/ggml-org/llama.cpp/releases/download/$TAG/llama-$TAG-bin-ubuntu-x64.tar.gz" $W/llbin.tgz; then
    mkdir -p $W/llbin && tar xzf $W/llbin.tgz -C $W/llbin --no-same-owner
    Q=$(find $W/llbin -name llama-quantize -type f | head -1)
    if [ -n "$Q" ]; then cp "$Q" $B/; find $W/llbin -name '*.so*' -exec cp {} $B/ \; ; chmod +x $B/llama-quantize; fi
    # llama-gguf-split too: an upload over Hugging Face's 50 GB limit goes up in parts (run.sh publish_dir)
    G=$(find $W/llbin -name llama-gguf-split -type f | head -1); [ -n "$G" ] && cp "$G" $B/ && chmod +x $B/llama-gguf-split
  fi
  works $B/llama-quantize && echo "prebuilt llama-quantize works" || echo "prebuilt llama-quantize missing or not runnable, building"
fi
if ! works $B/llama-quantize; then
  # 2) build it (the image has a compiler; cmake may need installing)
  command -v cmake >/dev/null || pip install -q cmake 2>&1 | tail -1
  rm -f $B/llama-quantize $B/*.so*
  ( cd $L && cmake -B build -DGGML_CUDA=OFF -DLLAMA_CURL=OFF -DBUILD_SHARED_LIBS=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_SERVER=OFF > $W/llama-cmake.log 2>&1 && cmake --build build --target llama-quantize llama-gguf-split -j >> $W/llama-cmake.log 2>&1 ) || echo "build failed (see llama-cmake.log)"
  Q=$(find $L/build -name llama-quantize -type f | head -1); [ -n "$Q" ] && [ "$Q" != "$B/llama-quantize" ] && cp "$Q" $B/
  G=$(find $L/build -name llama-gguf-split -type f | head -1); [ -n "$G" ] && [ "$G" != "$B/llama-gguf-split" ] && cp "$G" $B/
fi
# a work dir from an older run has llama-quantize but not llama-gguf-split: get it from the prebuilt download (never fatal)
if [ ! -x $B/llama-gguf-split ]; then
  [ -f $W/llbin.tgz ] || fetch "https://github.com/ggml-org/llama.cpp/releases/download/$TAG/llama-$TAG-bin-ubuntu-x64.tar.gz" $W/llbin.tgz
  mkdir -p $W/llbin && tar xzf $W/llbin.tgz -C $W/llbin --no-same-owner 2>/dev/null
  G=$(find $W/llbin -name llama-gguf-split -type f | head -1); [ -n "$G" ] && cp "$G" $B/ && chmod +x $B/llama-gguf-split
  for so in $(find $W/llbin -name '*.so*'); do [ -e $B/$(basename $so) ] || cp $so $B/; done
fi
[ -x $B/llama-gguf-split ] && echo "llama-gguf-split ready" || echo "llama-gguf-split not available: a GGUF over 50 GB can't be uploaded"
if works $B/llama-quantize; then echo "llama-quantize ready"; touch $W/llama-ready; else echo "llama-quantize NOT available: export will keep BF16 only"; touch $W/llama-failed; fi
