"use strict";

import { ethers } from "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.7.0/ethers.min.js";
import SampleRecipientJson from "./SampleRecipient.json" assert {type: "json"};
import SampleForwarderJson from "./SampleForwarder.json" assert {type: "json"};

async function init() {
    console.log("init", ethers.version);
    Vue.createApp(MainApp).mount("#main");
}

// Provider
var provider = null;

// Provider Network
var network = {
    name: "",
    chainId: "",
};

// Provider Signers
var signers = [];

async function connectProvider(providerUrl) {
    // 初期化
    if (provider) {
        try {
            provider.destroy();
        } catch (e) {
            console.log("provider.destroy err", e);
        }
    }
    provider = null;
    network.name = "";
    network.chainId = "";
    signers.length = 0;
    try {
        provider = new ethers.JsonRpcProvider(providerUrl);
        let blockNumber = await provider.getBlockNumber();
        console.log("getBlockNumber", blockNumber);
        let _network = await provider.getNetwork();
        network.name = _network.name;
        network.chainId = "0x" + _network.chainId.toString(16);
        console.log("network.chainId", network.chainId);
        console.log("network.name", network.name);
        let mnemonic = localStorage.getItem("mnemonic");
        if (!mnemonic) {
            mnemonic = ethers.Wallet.createRandom().mnemonic.phrase;
            localStorage.setItem("mnemonic", mnemonic);
        }
        let parent = ethers.HDNodeWallet.fromPhrase(mnemonic, network.chainId, "m/44'/60'/0'/0");
        for (let i = 0; i < 4; i++) {
            let wallet = parent.deriveChild(i);
            let signer = wallet.connect(provider);
            signers.push(signer);
        }
    } catch (err) {
        console.log("connectProvider err", err);
        if (provider) {
            try {
                provider.destroy();
            } catch (e) { }
        }
        provider = null;
        network.name = "";
        network.chainId = "";
        signers.length = 0;
        throw err;
    }
}

// Contract Wait Time
const WAIT_TIME = 30 * 1000;

const MainApp = {
    data() {
        return {
            loading: true,
            toast: {
                toast: null,
                message: "",
            },
            modal: {
                modal: null,
                title: "",
                message: "",
            },
            providerUrl: "http://127.0.0.1:8545/",
            network: {
                name: "",
                chainId: "",
            },
            wallets: [],
            faucetAddress: "",
            sampleForwarderContractAddress: "",
            sampleRecipientContractAddress: "",
            mintAddress: "all",
            mintAmount: 100,
            transferFrom: 1,
            transferTo: 2,
            transferAmount: 10,
            request: {
                from: "",
                to: "",
                value: 0n,
                gas: 0n,
                deadline: 0,
                data: "",
                signature: "",
            }
        };
    },
    mounted() {
        this.init();
    },
    methods: {
        async init() {
            this.loading = false;
            this.modal.modal = new bootstrap.Modal('#modal', {});
            this.toast.toast = new bootstrap.Toast('#toast', { animation: true, autohide: true, delay: 3000 });
        },
        showToast(message) {
            this.toast.message = message;
            this.toast.toast.show();
        },
        showModal(title, message) {
            this.modal.title = title;
            this.modal.message = message;
            this.modal.modal.show();
        },
        async connect() {
            try {
                this.wallets.length = 0;
                await connectProvider(this.providerUrl);
                if (provider) {
                    // Recipient Contract Check
                    let sampleRecipientContractAddress = localStorage.getItem("sampleRecipientContractAddress." + this.network.chainId);
                    console.log("sampleRecipientContractAddress", sampleRecipientContractAddress);
                    if (sampleRecipientContractAddress) {
                        let sampleRecipientContractCode = await provider.getCode(sampleRecipientContractAddress);
                        if (sampleRecipientContractCode && sampleRecipientContractCode.length > 2) {
                            this.sampleRecipientContractAddress = sampleRecipientContractAddress;
                        }
                    }
                    // Forwarder Contract Check
                    let sampleForwarderContractAddress = localStorage.getItem("sampleForwarderContractAddress." + this.network.chainId);
                    console.log("sampleForwarderContractAddress", sampleForwarderContractAddress);
                    if (sampleForwarderContractAddress) {
                        let sampleForwarderContractCode = await provider.getCode(sampleForwarderContractAddress);
                        if (sampleForwarderContractCode && sampleForwarderContractCode.length > 2) {
                            this.sampleForwarderContractAddress = sampleForwarderContractAddress;
                        }
                    }
                    // Create Wallets
                    for (let i = 0; i < signers.length; i++) {
                        let item = {
                            name: "User" + i,
                            address: signers[i].address,
                            balance: "-",
                            balanceOld: "-",
                            balanceText: "text-secondary",
                            token: "-",
                            tokenOld: "-",
                            tokenText: "text-secondary",
                        };
                        if (i == 0) {
                            item.name = "Relayer";
                            this.faucetAddress = item.address;
                        }
                        this.wallets.push(item);
                    }
                    await this.updateCoin();
                    if (this.sampleRecipientContractAddress) {
                        await this.updateToken();
                    }
                    this.showToast("Connected to provider");
                }
            } catch (err) {
                console.log("checkConnect err", err);
                this.showModal("Failed to connect to provider", err.message);
            }
        },
        async copyAddress(address) {
            console.log("copyAddress", address);
            navigator.clipboard.writeText(address)
                .then(() => {
                    this.showToast("Copied to clipboard");
                });

        },
        shortAddress(address) {
            if (!address || address.length < 10) {
                return "";
            }
            return address.substr(0, 6) + "..." + address.substr(-4);
        },
        formatEther(value) {
            let ether = "";
            if (value != "-") {
                ether = ethers.formatEther(value) + " ETH";
            }
            return ether;
        },
        async updateCoin() {
            if (provider) {
                try {
                    for (let i = 0; i < this.wallets.length; i++) {
                        let wallet = this.wallets[i];
                        let balance = await provider.getBalance(wallet.address);
                        wallet.balanceOld = wallet.balance;
                        wallet.balance = balance;
                    }
                } catch (err) {
                    console.log("updateCoin err", err);
                    this.showModal("Failed to updateCoin", err.message);
                }
            }
        },
        diffBalance(wallet) {
            let value = "-";
            if (wallet.balance != "-" && wallet.balanceOld != "-") {
                value = wallet.balance - wallet.balanceOld;
                if (value > 0) {
                    value = "+" + value;
                    wallet.balanceText = "text-primary";
                } else if (value < 0) {
                    value = "" + value;
                    wallet.balanceText = "text-danger";
                } else {
                    value = "0";
                    wallet.balanceText = "text-secondary";
                };
            }
            return value;
        },
        async updateToken() {
            if (provider) {
                if (this.sampleRecipientContractAddress) {
                    try {
                        let contract = new ethers.Contract(this.sampleRecipientContractAddress, SampleRecipientJson.abi, provider);
                        for (let i = 0; i < this.wallets.length; i++) {
                            let wallet = this.wallets[i];
                            let token = await contract.balanceOf(wallet.address);
                            wallet.tokenOld = wallet.token;
                            wallet.token = token;
                        }
                    } catch (err) {
                        console.log("updateToken err", err);
                        this.showModal("Failed to updateToken", err.message);
                    }
                }
            }
        },
        diffToken(wallet) {
            let value = "-";
            if (wallet.token != "-" && wallet.tokenOld != "-") {
                value = wallet.token - wallet.tokenOld;
                if (value > 0) {
                    value = "+" + value;
                    wallet.tokenText = "text-primary";
                } else if (value < 0) {
                    value = "" + value;
                    wallet.tokenText = "text-danger";
                } else {
                    value = "0";
                    wallet.tokenText = "text-secondary";
                };
            }
            return value;
        },
        async faucet() {
            this.loading = true;
            if (provider) {
                try {
                    let signers = await provider.listAccounts();
                    let isComplete = false;
                    for (let signer of signers) {
                        let balance = await provider.getBalance(signer.address);
                        if (balance > ethers.WeiPerEther) {
                            await this.updateCoin();
                            let tx = await signer.sendTransaction({
                                to: this.faucetAddress,
                                value: ethers.parseEther("0.1"),
                            });
                            await tx.wait(1, WAIT_TIME);
                            await this.updateCoin();
                            isComplete = true;
                            break;
                        }
                    }
                    if (isComplete) {
                        this.showToast("Faucet completed");
                    } else {
                        this.showModal("Failed to faucet", "An account that can be Faucet was not found.");
                    }
                } catch (err) {
                    console.log("faucet err", err);
                    this.showModal("Failed to faucet", err.message);
                }
            }
            this.loading = false;
        },
        async deploy() {
            this.loading = true;
            if (signers.length > 0) {
                try {
                    await this.updateCoin();
                    let signer = signers[0];
                    let sampleForwarderFactory = new ethers.ContractFactory(SampleForwarderJson.abi, SampleForwarderJson.bytecode, signer);
                    let sampleForwarderContract = await sampleForwarderFactory.deploy("SampleForwarder");
                    await sampleForwarderContract.waitForDeployment();
                    console.log("SampleForwarder", sampleForwarderContract.target);
                    this.sampleForwarderContractAddress = sampleForwarderContract.target;
                    let sampleRecipientFactory = new ethers.ContractFactory(SampleRecipientJson.abi, SampleRecipientJson.bytecode, signer);
                    let sampleRecipientContract = await sampleRecipientFactory.deploy("SampleRecipient", "SRC", sampleForwarderContract.target);
                    await sampleRecipientContract.waitForDeployment();
                    console.log("SampleRecipient", sampleRecipientContract.target);
                    this.sampleRecipientContractAddress = sampleRecipientContract.target;
                    this.showToast("Deployed contract");
                    await this.updateCoin();
                    // Save Contract Address
                    localStorage.setItem("sampleForwarderContractAddress." + this.network.chainId, sampleForwarderContract.target);
                    localStorage.setItem("sampleRecipientContractAddress." + this.network.chainId, sampleRecipientContract.target);
                } catch (err) {
                    console.log("deploy err", err);
                    this.showModal("Failed to deploy contract", err.message);
                }
            }
            this.loading = false;
        },
        async mintToken() {
            console.log(this.mintAddress, this.mintAmount);
            if (this.sampleRecipientContractAddress) {
                this.loading = true;
                if (signers.length > 0) {
                    try {

                        await this.updateCoin();
                        await this.updateToken();
                        let contract = new ethers.Contract(this.sampleRecipientContractAddress, SampleRecipientJson.abi, signers[0]);
                        for (let i = 0; i < this.wallets.length; i++) {
                            let wallet = this.wallets[i];
                            if (this.mintAddress == "all" || this.mintAddress == wallet.address) {
                                let tx = await contract.mint(wallet.address, this.mintAmount);
                                await tx.wait(1, WAIT_TIME);
                                console.log("mintToken", wallet.name, wallet.address, this.mintAmount);
                            }
                        }
                        await this.updateToken();
                        await this.updateCoin();
                    } catch (err) {
                        console.log("mintToken err", err);
                        this.showModal("Failed to mint token", err.message);
                    }
                }
                this.loading = false;
            }
        },
        async signMetaTransaction() {
            this.clearRequest();
            if (this.transferFrom == this.transferTo) {
                this.showModal("Failed to sign meta transaction", "Please select different users");
                return;
            }
            if (this.sampleRecipientContractAddress) {
                this.loading = true;
                if (signers.length > this.transferFrom && signers.length > this.transferTo) {
                    try {
                        let user1 = signers[this.transferFrom];
                        let user2 = signers[this.transferTo];
                        let sampleForwarder = new ethers.Contract(this.sampleForwarderContractAddress, SampleForwarderJson.abi, user1);
                        let sampleRecipient = new ethers.Contract(this.sampleRecipientContractAddress, SampleRecipientJson.abi, user1);
                        let eip712domain = await sampleForwarder.eip712Domain();
                        let domain = {
                            chainId: eip712domain.chainId,
                            name: eip712domain.name,
                            verifyingContract: eip712domain.verifyingContract,
                            version: eip712domain.version,
                        };
                        let types = {
                            ForwardRequest: [
                                { type: "address", name: "from" },
                                { type: "address", name: "to" },
                                { type: "uint256", name: "value" },
                                { type: "uint256", name: "gas" },
                                { type: "uint256", name: "nonce" },
                                { type: "uint48", name: "deadline" },
                                { type: "bytes", name: "data" },
                            ],
                        };
                        let iface = new ethers.Interface(SampleRecipientJson.abi);
                        let data = iface.encodeFunctionData("transfer", [user2.address, this.transferAmount]);
                        let value = {
                            from: user1.address,
                            to: sampleRecipient.target,
                            value: 0n,
                            gas: 50000n,
                            nonce: await sampleForwarder.nonces(user1.address),
                            deadline: (Math.floor(Date.now() / 1000) + 3600),
                            data: data,
                        };
                        let sign = await user1.signTypedData(domain, types, value);
                        this.request.from = value.from;
                        this.request.to = value.to;
                        this.request.value = value.value;
                        this.request.gas = value.gas;
                        this.request.deadline = value.deadline;
                        this.request.data = value.data;
                        this.request.signature = sign;
                    } catch (err) {
                        console.log("signMetaTransaction err", err);
                        this.showModal("Failed to sign meta transaction", err.message);
                    }
                } else {
                    this.showModal("Failed to sign meta transaction", "Illegal select different users");
                }
                this.loading = false;
            }
        },
        async sendMetaTransaction() {
            if (this.sampleRecipientContractAddress) {
                if (signers.length > 0) {
                    this.loading = true;
                    try {
                        await this.updateCoin();
                        await this.updateToken();
                        let request = {
                            from: this.request.from,
                            to: this.request.to,
                            value: this.request.value,
                            gas: this.request.gas,
                            deadline: this.request.deadline,
                            data: this.request.data,
                            signature: this.request.signature,
                        };
                        let sampleForwarder = new ethers.Contract(this.sampleForwarderContractAddress, SampleForwarderJson.abi, signers[0]);
                        let tx = await sampleForwarder.execute(request);
                        await tx.wait(1, WAIT_TIME);
                        this.clearRequest();
                        await this.updateCoin();
                        await this.updateToken();
                    } catch (e) {
                        console.log("sendMetaTransaction err", e);
                        this.showModal("Failed to send meta transaction", e.message);
                    }
                    this.loading = false;
                }
            }
        },
        clearRequest() {
            this.request.from = "";
            this.request.to = "";
            this.request.value = 0n;
            this.request.gas = 0n;
            this.request.deadline = 0;
            this.request.data = "";
            this.request.signature = "";
        },
        short(message) {
            let short = "";
            if (message && message.length > 42) {
                short = message.substr(0, 42) + "…";
            }
            return short;
        },
        whoAddress(address) {
            let who = "";
            for (let i = 0; i < this.wallets.length; i++) {
                let wallet = this.wallets[i];
                if (wallet.address == address) {
                    who = wallet.name + " Wallet Address";
                    break;
                }
            }
            return who;
        },
        formatDate(deadline) {
            let date = "";
            if (deadline > 0) {
                date = new Date(deadline * 1000);
            }
            return date.toLocaleString();
        }
    }
}


window.addEventListener("load", init);
