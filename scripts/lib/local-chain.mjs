// Local EVM chain leg: ganache (real local Ethereum execution) + solc
// compilation of contracts/TraceAnchor.sol + viem deployment, anchoring,
// and re-verification. Every hash, tx, and receipt is real chain state.
import ganache from "ganache";
import solc from "solc";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient, createWalletClient, http, keccak256, toHex,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";

const CHAIN_ID = 1337;

export const SEPOLIA = {
  id: 11155111, name: "sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://ethereum-sepolia-rpc.publicnode.com"] } },
  blockExplorers: { default: { name: "Etherscan", url: "https://sepolia.etherscan.io" } },
};

export function compileAnchor() {
  const source = readFileSync(join(process.cwd(), "contracts", "TraceAnchor.sol"), "utf8");
  const input = {
    language: "Solidity",
    sources: { "TraceAnchor.sol": { content: source } },
    settings: { evmVersion: "paris", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length > 0) {
    throw new Error(`solc errors: ${errors.map((e) => e.formattedMessage).join(" | ").slice(0, 400)}`);
  }
  const contract = out.contracts["TraceAnchor.sol"]["TraceAnchor"];
  return { abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` };
}

export async function startLocalChain(port = 8545) {
  const server = ganache.server({
    chain: { chainId: CHAIN_ID },
    wallet: { mnemonic: "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat", totalAccounts: 3 },
    logging: { quiet: true },
  });
  await server.listen(port);
  const chain = {
    id: CHAIN_ID, name: "trace-local",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [`http://127.0.0.1:${port}`] } },
  };
  const transport = http(`http://127.0.0.1:${port}`);
  const publicClient = createPublicClient({ chain, transport });
  // Standard ganache deterministic mnemonic — local test funds only, never mainnet.
  const account = mnemonicToAccount("candy maple cake sugar pudding cream honey rich smooth crumble sweet treat");
  const walletClient = createWalletClient({ account, chain, transport });
  return {
    server, chain, publicClient, walletClient, account,
    rpcUrl: `http://127.0.0.1:${port}`,
    async stop() { await server.close(); },
  };
}
/**
 * Connect to an external EVM testnet (Sepolia). Private key comes from
 * SEPOLIA_PRIVATE_KEY env only — never hardcoded, never logged.
 */
export async function connectExternalChain({ rpcUrl, chain, privateKey }) {
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey.trim())) {
    const err = new Error("SEPOLIA_PRIVATE_KEY is missing or malformed (0x + 64 hex).");
    err.code = "chain-not-configured";
    throw err;
  }
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(privateKey.trim());
  const transport = http(rpcUrl, { timeout: 60000 });
  const publicClient = createPublicClient({ chain, transport });
  const walletClient = createWalletClient({ account, chain, transport });
  const balance = await publicClient.getBalance({ address: account.address });
  return {
    server: null, chain, publicClient, walletClient, account,
    rpcUrl, address: account.address, balanceWei: balance.toString(),
    async stop() { /* external chain: nothing to stop */ },
  };
}

export async function deployAnchor(publicClient, walletClient, account, { abi, bytecode }) {
  const hash = await walletClient.deployContract({ abi, bytecode, account });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error("Deploy produced no contract address.");
  return { address: receipt.contractAddress, deployTx: hash, blockNumber: Number(receipt.blockNumber) };
}

export function evidenceRecordId(record) {
  return keccak256(toHex(JSON.stringify(record)));
}

/** Anchor {evidenceRoot, investigationIdHash, schema, app} on-chain. Real tx. */
export async function anchorOnChain(publicClient, walletClient, account, address, abi, payload) {
  const hash = await walletClient.writeContract({
    address, abi, functionName: "anchorEvidence",
    args: [payload.evidenceRoot, payload.investigationIdHash, payload.schemaVersion, payload.appVersion],
    account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { txHash: hash, blockNumber: Number(receipt.blockNumber), status: receipt.status };
}

/** Re-verify: read getAnchor + verifyAnchor and check the emitted event. */
export async function verifyOnChain(publicClient, address, abi, payload) {
  const [idHash, timestamp, schemaVersion, appVersion, exists] = await publicClient.readContract({
    address, abi, functionName: "getAnchor", args: [payload.evidenceRoot],
  });
  const anchored = await publicClient.readContract({
    address, abi, functionName: "verifyAnchor",
    args: [payload.evidenceRoot, payload.investigationIdHash],
  });
  const logs = await publicClient.getContractEvents({
    address, abi, eventName: "EvidenceAnchored",
    args: { evidenceRoot: payload.evidenceRoot },
    fromBlock: 0n,
  });
  return {
    exists: Boolean(exists),
    anchored: Boolean(anchored),
    storedIdHash: idHash,
    storedTimestamp: timestamp.toString(),
    storedSchema: schemaVersion,
    eventCount: logs.length,
    match:
      Boolean(exists) && Boolean(anchored) &&
      String(idHash).toLowerCase() === String(payload.investigationIdHash).toLowerCase() &&
      logs.length > 0,
  };
}
