// console.clear()
const ethers = require('ethers');
const pako = require('pako')
const fs = require('fs');
const TOKEN = fs.readFileSync(".secret").toString().trim();

const Discord = require('discord.js');
const command = require('./command')

const intents = new Discord.Intents(32767)
const client = new Discord.Client({ intents });

client.on("ready", () => console.log("Bot is online!"));

const TREASURY_ADDRESS = '0x7ce1af84F3d83305315aE460B6F18C011F0b268e';

const ROLLUP_ADDRESS = "0x96e471b5945373de238963b4e032d3574be4d195"
const ROLLUP_RPC = 'https://mainnet-habitat-l2.fly.dev/';
// const EVOLUTION_ENDPOINT = 'https://habitat-evolution.fly.dev/submitTransaction/';

const HABITAT_ROLLUP_ABI = [
    'event BlockBeacon()',
    'event ClaimUsername(address indexed account, bytes32 indexed shortString)',
    'event ClaimedStakingReward(address indexed account, address indexed token, uint256 indexed epoch, uint256 amount)',
    'event CommunityCreated(address indexed governanceToken, bytes32 indexed communityId)',
    'event CustomBlockBeacon()',
    'event DelegatedAmount(address indexed account, address indexed delegatee, address indexed token, uint256 value)',
    'event DelegateeVotedOnProposal(address indexed account, bytes32 indexed proposalId, uint8 signalStrength, uint256 shares)',
    'event Deposit(address owner, address token, uint256 value, uint256 tokenType)',
    'event MetadataUpdated(uint256 indexed topic, bytes metadata)',
    'event ModuleRegistered(address indexed contractAddress, bytes metadata)',
    'event NewSolution()',
    'event ProposalCreated(address indexed vault, bytes32 indexed proposalId, uint256 startDate)',
    'event ProposalProcessed(bytes32 indexed proposalId, uint256 indexed votingStatus)',
    'event RollupUpgrade(address target)',
    'event TokenTransfer(address indexed token, address indexed from, address indexed to, uint256 value, uint256 epoch)',
    'event VaultCreated(bytes32 indexed communityId, address indexed condition, address indexed vaultAddress)',
    'event VirtualERC20Created(address indexed account, address indexed token)',
    'event VotedOnProposal(address indexed account, bytes32 indexed proposalId, uint8 signalStrength, uint256 shares)',
    'event Withdraw(address owner, address token, uint256 value)',
    'function EPOCH_GENESIS() pure returns (uint256)',
    'function INSPECTION_PERIOD() view returns (uint16)',
    'function INSPECTION_PERIOD_MULTIPLIER() view returns (uint256)',
    'function MAX_BLOCK_SIZE() view returns (uint24)',
    'function ROLLUP_MANAGER() pure returns (address)',
    'function SECONDS_PER_EPOCH() pure returns (uint256)',
    'function STAKING_POOL_FEE_DIVISOR() pure returns (uint256)',
    'function blockMeta(uint256 height) view returns (uint256 ret)',
    'function canFinalizeBlock(uint256 blockNumber) view returns (bool)',
    'function challenge()',
    'function communityOfVault(address vault) returns (bytes32)',
    'function deposit(address token, uint256 amountOrId, address receiver)',
    'function dispute(uint256 blockNumber, uint256 bitmask)',
    'function executionPermit(address vault, bytes32 proposalId) view returns (bytes32 ret)',
    'function finalizeSolution()',
    'function finalizedHeight() view returns (uint256 ret)',
    'function getActiveDelegatedVotingStake(address token, address account) returns (uint256)',
    'function getActiveVotingStake(address token, address account) returns (uint256)',
    'function getBalance(address tkn, address account) returns (uint256)',
    'function getCurrentEpoch() returns (uint256)',
    'function getERC20Exit(address target, address owner) view returns (uint256)',
    'function getERC721Exit(address target, uint256 tokenId) view returns (address)',
    'function getErc721Owner(address tkn, uint256 b) returns (address)',
    'function getHistoricTub(address token, address account, uint256 epoch) returns (uint256)',
    'function getHistoricTvl(address token, uint256 epoch) returns (uint256)',
    'function getLastClaimedEpoch(address token, address account) returns (uint256)',
    'function getProposalStatus(bytes32 a) returns (uint256)',
    'function getTotalMemberCount(bytes32 communityId) returns (uint256)',
    'function getTotalValueLocked(address token) returns (uint256)',
    'function getTotalVotingShares(bytes32 proposalId) returns (uint256)',
    'function getUnlockedBalance(address token, address account) returns (uint256 ret)',
    'function pendingHeight() view returns (uint256 ret)',
    'function registerModule(uint256 _type, address contractAddress, bytes32 codeHash, bytes)',
    'function submitBlock()',
    'function submitSolution()',
    'function tokenOfCommunity(bytes32 a) returns (address)',
    'function txNonces(address a) returns (uint256)',
    'function upgradeRollup(address newImplementation)',
    'function withdraw(address owner, address token, uint256 tokenId)'
];


async function decodeMetadata (str) {
    try {
      return JSON.parse(pako.inflateRaw(ethers.utils.arrayify(str), { to: 'string' }));
    } catch (e) {
      console.error(e);
      return {};
    }
  };


const loadProposals = async() => {
    const rollupProvider = new ethers.providers.JsonRpcProvider(ROLLUP_RPC, 'any');
    const rollup = new ethers.Contract(ROLLUP_ADDRESS, HABITAT_ROLLUP_ABI, rollupProvider);
    // repl.start().context.rollup = rollup;
    const filter = rollup.filters.ProposalCreated([TREASURY_ADDRESS], null, null);
    filter.fromBlock = 1;
    const data = await rollup.provider.getLogs(filter);
    //iterate over data
    const items = await Promise.all(data.map(async i => {
      //get proposalId from 3rd item in "topics"
      const proposalId = i.topics[2];
      //get 'txHash' from each proposal
      const txHash = i.transactionHash;
      //get 'title' and 'details' from 'txHash (Habitat proposal url)'
      const tx = await rollup.provider.send('eth_getTransactionByHash', [txHash]);
      const metadata = await decodeMetadata(tx.message.metadata);
      //get proposal's votes from proposalId
      const votes = (Number(await rollup.callStatic.getTotalVotingShares(proposalId))) * 0.0000000001;
      //universal link to the issues repo

      let item = {
        proposalId,
        votes,
        txHash,
        block: i.blockNumber,
        title: metadata.title,
        body: metadata.details
      }
      return item
    }))
    const openProposals = items;
    fs.readFile('proposals.json', function(err, jsonData){
        const storedProposals = JSON.parse(jsonData);
        if (openProposals !== storedProposals) {
            console.log('Changes present: ');
            //get and display differences
            const missingProposals = openProposals.filter(o => !storedProposals.some(v => v.title === o.title));
            console.log(missingProposals)

            for (const missingProposal of missingProposals) {
              const botLogsChannel = client.channels.cache.get('893009393178783744');
              botLogsChannel.send(`!createChannel 💬${missingProposal.title}`);
            }   

            fs.writeFile ("proposals.json", JSON.stringify(openProposals), function(err) {
              if (err) throw err;
                console.log('complete');
              }
            );
        } else {
            console.log('No new proposals... ');
        }
    });
}

// console.log(loadProposals())
// keep a file of all proposal objects
// if a new proposal is added, get the latest proposal's title
// send 'title' via channels.create(title) 

//assign to channel "Feature Farm"


client.on('ready', () => {
  console.log('The client is ready!')

  command(client, 'createChannel', (message) => {
    const name = message.content.replace('!createChannel ', '')

    message.guild.channels
    .create(name, { type: 'text',
    })
    .then((channel) => {
    const categoryId = '892702333719429130'
    channel.setParent(categoryId)
    })
  })
})


client.login(TOKEN);

loadProposals();
// if a proposal is completed, or deleted, delete it from channels


// run on raspberry pi

