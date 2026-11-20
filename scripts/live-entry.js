// Aureous live trading: the parts of @nktkas/hyperliquid and viem the site needs, as one browser global.
import { HttpTransport, InfoClient, ExchangeClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createWalletClient, custom } from "viem";
globalThis.AureousHL = {
  HttpTransport, InfoClient, ExchangeClient, privateKeyToAccount, generatePrivateKey,
  // a viem wallet client for the browser wallet (MetaMask, Rabby…), already asked for its account
  async browserWallet(provider) {
    const [address] = await provider.request({ method: "eth_requestAccounts" });
    return { address, client: createWalletClient({ account: address, transport: custom(provider) }) };
  },
};
