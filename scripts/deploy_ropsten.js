const { ethers } = require("hardhat");

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying ICO contract with the account:", deployer.address);

    const ICO = await ethers.getContractFactory("ICO");
    const rate = 1000; // Set the ICO rate to 1000 tokens per Ether
    const totalSupply = ethers.utils.parseEther("1000000"); // Set the total supply to 1,000,000 tokens
    const ICOContract = await ICO.deploy(rate, totalSupply);

    console.log("ICO contract deployed to address:", ICOContract.address);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });