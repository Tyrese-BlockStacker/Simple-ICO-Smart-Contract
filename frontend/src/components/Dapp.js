import React from "react";
import { ethers } from "ethers";

import TokenArtifact from "../contracts/Token.json";
import contractAddress from "../contracts/contract-address.json";

import setting from "../global/setting.json";
import moment from 'moment';

import { NoWalletDetected } from "./NoWalletDetected";
import { Transfer } from "./Transfer";
import { TransactionErrorMessage } from "./TransactionErrorMessage";
import { WaitingForTransactionMessage } from "./WaitingForTransactionMessage";
import Clock from "./Clock/Clock";
import "react-step-progress-bar/styles.css";
import { ProgressBar, Step } from "react-step-progress-bar";
import 'react-circular-progressbar/dist/styles.css';
import { NetworkErrorMessage } from "./NetworkErrorMessage";
// This is the default id used by the Hardhat Network
const HARDHAT_NETWORK_ID = '97';

// This is an error code that indicates that the user canceled a transaction
const ERROR_CODE_TX_REJECTED_BY_USER = 4001;

export class Dapp extends React.Component {
	constructor(props) {
		super(props);
		this.initialState = {
			tokenData: {name:'T3P',symbol:'t3p'},
			selectedAddress: undefined,
			balance: undefined,
			// The ID about transactions being sent, and any possible error with them
			txBeingSent: undefined,
			transactionError: undefined,
			networkError: undefined,
		};

		this.state = this.initialState;
	}

	render() {
		if (window.ethereum === undefined) {
			return <NoWalletDetected />;
		}

		return (
			<div className="container p-4">
				<div className="row">
					<div className="col-4 d-flex justify-content-center">
						<Clock></Clock>
					</div>
					<div className="col-8 p-4">
						<h1 style={{color:'white'}}>
							Welcome to {this.state.tokenData.name} market.
						</h1>
						<h1 style={{color:'white'}}>
							You have {this.state.balance} {this.state.tokenData.symbol}.
						</h1>
						{this.state.networkError && (
							<NetworkErrorMessage
								message={this.state.networkError}
								dismiss={this._dismissNetworkError()}
							/>
						)}
						<button className="btn btn-outline-danger" style={{ position: 'absolute', right: 0, top: 0 }}
							onClick={() => this._connectWallet()}>
							<span className="spinner-grow spinner-grow-sm"></span>
							&nbsp;{this.state.selectedAddress?"Connected":"Connet Wallet"}
						</button>
					</div>
				</div>
				<div className="row">
					<div className="d-flex justify-content-between" style={{ width: "100%" }}>
						<div className="">
							<h4 className="text-success">Start time : {}</h4>
						</div>
						<div className="">
							<h4 className="text-success">Tue 10 May 2023</h4>
						</div>
					</div>
				</div>
				<hr />
				<div className="row">
					<div className="col-12">
						{this.state.txBeingSent && (
							<WaitingForTransactionMessage txHash={this.state.txBeingSent} />
						)}
						{this.state.transactionError && (
							<TransactionErrorMessage
								message={this._getRpcErrorMessage(this.state.transactionError)}
								dismiss={() => this._dismissTransactionError()}
							/>
						)}
					</div>
				</div>

				<Transfer
					transferTokens={(amount) =>
						this._transferTokens(amount)
					}
					tokenSymbol={this.state.tokenData.symbol}
				/>

				<div className="row p-4">
					<ProgressBar
						percent={75}
						filledBackground="linear-gradient(to right, #fefb72, #f0bb31)"
						width={"100%"}
						height={30}
					>
						<Step transition="scale">
							{({ accomplished }) => (
								<img
									style={{ filter: `grayscale(${accomplished ? 0 : 80}%)` }}
									width="30"
									src="https://vignette.wikia.nocookie.net/pkmnshuffle/images/9/9d/Pichu.png/revision/latest?cb=20170407222851"
								/>
							)}
						</Step>
						<Step transition="scale">
							{({ accomplished }) => (
								<img
									style={{ filter: `grayscale(${accomplished ? 0 : 80}%)` }}
									width="30"
									src="https://vignette.wikia.nocookie.net/pkmnshuffle/images/9/97/Pikachu_%28Smiling%29.png/revision/latest?cb=20170410234508"
								/>
							)}
						</Step>
						<Step transition="scale">
							{({ accomplished }) => (
								<img
									style={{ filter: `grayscale(${accomplished ? 0 : 80}%)` }}
									width="30"
									src="https://orig00.deviantart.net/493a/f/2017/095/5/4/raichu_icon_by_pokemonshuffle_icons-db4ryym.png"
								/>
							)}
						</Step>
					</ProgressBar>
				</div>

				
			</div>
		);
	}

	componentWillUnmount() {
		this._stopPollingData();
	}

	async _connectWallet() {
		const [selectedAddress] = await window.ethereum.request({ method: 'eth_requestAccounts' });
		this._checkNetwork();
		this._initialize(selectedAddress);

		window.ethereum.on("accountsChanged", ([newAddress]) => {
			this._stopPollingData();
			if (newAddress === undefined) {
				return this._resetState();
			}
			this._initialize(newAddress);
		});
	}

	_initialize(userAddress) {
		this.setState({
			selectedAddress: userAddress,
		});

		this._initializeEthers();
		this._startPollingData();
	}

	async _initializeEthers() {
		this._provider = new ethers.providers.Web3Provider(window.ethereum);
		this._token = new ethers.Contract(
			contractAddress.Token,
			TokenArtifact.abi,
			this._provider.getSigner(0)
		);
	}

	_startPollingData() {
		this._pollDataInterval = setInterval(() => this._updateBalance(), 1000);
		this._updateBalance();
	}

	_stopPollingData() {
		clearInterval(this._pollDataInterval);
		this._pollDataInterval = undefined;
	}

	async _updateBalance() {
		const balance = await this._token.balanceOf();
		this.setState({ balance });
	}

	// This method sends an ethereum transaction to transfer tokens.
	// While this action is specific to this application, it illustrates how to
	// send a transaction.
	async _transferTokens(amount) {
		// Sending a transaction is a complex operation:
		//   - The user can reject it
		//   - It can fail before reaching the ethereum network (i.e. if the user
		//     doesn't have ETH for paying for the tx's gas)
		//   - It has to be mined, so it isn't immediately confirmed.
		//     Note that some testing networks, like Hardhat Network, do mine
		//     transactions immediately, but your dapp should be prepared for
		//     other networks.
		//   - It can fail once mined.
		//
		// This method handles all of those things, so keep reading to learn how to
		// do it.

		try {
			// If a transaction fails, we save that error in the component's state.
			// We only save one such error, so before sending a second transaction, we
			// clear it.
			this._dismissTransactionError();

			// We send the transaction, and save its hash in the Dapp's state. This
			// way we can indicate that we are waiting for it to be mined.
			console.log(amount);
			const tx = await this._token.deposit(amount);
			this.setState({ txBeingSent: tx.hash });

			// We use .wait() to wait for the transaction to be mined. This method
			// returns the transaction's receipt.
			const receipt = await tx.wait();

			// The receipt, contains a status flag, which is 0 to indicate an error.
			if (receipt.status === 0) {
				// We can't know the exact error that made the transaction fail when it
				// was mined, so we throw this generic one.
				throw new Error("Transaction failed");
			}

			// If we got here, the transaction was successful, so you may want to
			// update your state. Here, we update the user's balance.
			await this._updateBalance();
		} catch (error) {
			// We check the error code to see if this error was produced because the
			// user rejected a tx. If that's the case, we do nothing.
			if (error.code === ERROR_CODE_TX_REJECTED_BY_USER) {
				return;
			}

			// Other errors are logged and stored in the Dapp's state. This is used to
			// show them to the user, and for debugging.
			console.error(error);
			this.setState({ transactionError: error });
		} finally {
			// If we leave the try/catch, we aren't sending a tx anymore, so we clear
			// this part of the state.
			this.setState({ txBeingSent: undefined });
		}
	}

	// This method just clears part of the state.
	_dismissTransactionError() {
		this.setState({ transactionError: undefined });
	}

	// This method just clears part of the state.
	_dismissNetworkError() {
		this.setState({ networkError: undefined });
	}

	// This is an utility method that turns an RPC error into a human readable
	// message.
	_getRpcErrorMessage(error) {
		if (error.data) {
			return error.data.message;
		}

		return error.message;
	}

	// This method resets the state
	_resetState() {
		this.setState(this.initialState);
	}

	async _switchChain() {
		const chainIdHex = `0x${HARDHAT_NETWORK_ID.toString(16)}`
		await window.ethereum.request({
			method: "wallet_switchEthereumChain",
			params: [{ chainId: chainIdHex }],
		});
		await this._initialize(this.state.selectedAddress);
	}

	// This method checks if the selected network is Localhost:8545
	_checkNetwork() {
		if (window.ethereum.networkVersion !== HARDHAT_NETWORK_ID) {
			this._switchChain();
		}
	}
}
