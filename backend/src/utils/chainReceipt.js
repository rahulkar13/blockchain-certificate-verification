const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getRpcUrl = () => process.env.SEPOLIA_RPC_URL || process.env.RPC_URL;

export const waitForTransactionReceipt = async (
  txHash,
  {
    timeoutMs = Number(process.env.CHAIN_CONFIRMATION_TIMEOUT_MS || 600000),
    pollMs = Number(process.env.CHAIN_CONFIRMATION_POLL_MS || 5000),
  } = {}
) => {
  const rpcUrl = getRpcUrl();

  if (!rpcUrl) {
    throw new Error("Blockchain RPC URL is missing in backend .env.");
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "eth_getTransactionReceipt",
        params: [txHash],
      }),
    });

    const payload = await response.json();
    if (payload.error) {
      throw new Error(payload.error.message || "RPC transaction receipt error.");
    }

    if (payload.result) {
      return {
        confirmed: payload.result.status === "0x1",
        failed: payload.result.status === "0x0",
        receipt: payload.result,
      };
    }

    await sleep(pollMs);
  }

  return {
    confirmed: false,
    failed: false,
    timedOut: true,
  };
};
