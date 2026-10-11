# CipherPay, as tried for stage 0

What was run on 11 Oct 2026 to see a shielded testnet payment arrive (PLAN.md, "Stage 0: what was run").
CipherPay itself is not in this repository: it is `atmospherelabs-dev/cipherpay-api` on GitHub (MIT), tried
at commit `f6f022d`.

- `nu7.patch`: the change that made detection work on testnet. It moves CipherPay to the Zcash libraries
  that know the NU7 upgrade, and reads each transaction with the consensus branch the transaction names
  instead of assuming NU6.3. Without it CipherPay drops every testnet transaction made after NU7, without
  an error.
- `Dockerfile`: CipherPay's own, with two fixes. Its Rust image was too old for its dependencies, and its
  dependency-caching step left an empty program in the final image.
- `cipherpay.env.example`: the settings of the trial.

To repeat it:

```bash
git clone https://github.com/atmospherelabs-dev/cipherpay-api.git && cd cipherpay-api
git checkout f6f022d
git apply /path/to/engine/cipherpay/nu7.patch
rm Cargo.lock
docker build -f /path/to/engine/cipherpay/Dockerfile -t cipherpay-trial .
docker run -d --name cipherpay-trial --env-file cipherpay.env \
  -p 127.0.0.1:3080:3080 -v cipherpay-trial-data:/data cipherpay-trial
```

Then register a testnet viewing key (`POST /api/merchants` with `{"ufvk": "uviewtest1..."}`), create an
invoice (`POST /api/invoices` with `{"amount": 1, "currency": "USD"}` and the API key as a bearer token),
pay its address, and read `GET /api/invoices/<id>/status`.

Keep the port bound to this machine. On testnet CipherPay makes invoices for anyone who can reach it,
without a key.
