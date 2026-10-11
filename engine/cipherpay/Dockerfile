# The shop's payment engine: CipherPay at a fixed commit, with the two patches beside this file
# (README.md says what each does). It builds from nothing but this folder, so a server can build
# it without a checkout of CipherPay.

FROM rust:1-slim-bookworm AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y pkg-config libssl-dev git ca-certificates && rm -rf /var/lib/apt/lists/*

# CipherPay, at the commit the patches were written against.
RUN git clone https://github.com/atmospherelabs-dev/cipherpay-api.git . && git checkout --quiet f6f022d

COPY nu7.patch watch.patch ./
# The first patch moves to newer Zcash libraries, so upstream's lock file no longer fits. The one
# beside this file is from the build that was run against the chain: the same versions every time.
RUN git apply nu7.patch && git apply watch.patch
COPY Cargo.lock ./Cargo.lock

RUN cargo build --release --locked

FROM debian:bookworm-slim

# curl: the entrypoint's and the registration's only tool.
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/cipherpay /usr/local/bin/cipherpay
COPY entrypoint.sh /usr/local/bin/zolace-engine
COPY register.sh /usr/local/bin/zolace-register
RUN chmod +x /usr/local/bin/zolace-engine /usr/local/bin/zolace-register

EXPOSE 3080

CMD ["zolace-engine"]
