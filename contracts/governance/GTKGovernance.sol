// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract GTKGovernance is AccessControl {
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    struct Proposal {
        uint256 id;
        string description;
        address target;
        bytes callData;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 startTime;
        uint256 endTime;
        bool executed;
        bool canceled;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    uint256 public proposalCount;
    uint256 public votingPeriod = 7 days;
    uint256 public quorum = 1000 * 10 ** 18;

    event ProposalCreated(uint256 indexed id, string description, address proposer);
    event VoteCast(uint256 indexed id, address voter, bool support, uint256 votes);
    event ProposalExecuted(uint256 indexed id);
    event ProposalCanceled(uint256 indexed id);
    event VotingPeriodUpdated(uint256 newPeriod);
    event QuorumUpdated(uint256 newQuorum);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PROPOSER_ROLE, msg.sender);
        _grantRole(EXECUTOR_ROLE, msg.sender);
    }

    function createProposal(
        string memory description,
        address target,
        bytes memory callData
    ) external onlyRole(PROPOSER_ROLE) returns (uint256) {
        uint256 id = proposalCount++;
        proposals[id] = Proposal({
            id: id,
            description: description,
            target: target,
            callData: callData,
            forVotes: 0,
            againstVotes: 0,
            startTime: block.timestamp,
            endTime: block.timestamp + votingPeriod,
            executed: false,
            canceled: false
        });
        emit ProposalCreated(id, description, msg.sender);
        return id;
    }

    function vote(uint256 proposalId, bool support, uint256 votes) external {
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp < proposal.endTime, "Gov: voting ended");
        require(!proposal.executed && !proposal.canceled, "Gov: not active");
        require(!hasVoted[proposalId][msg.sender], "Gov: already voted");
        require(votes >= quorum, "Gov: below quorum");

        hasVoted[proposalId][msg.sender] = true;

        if (support) {
            proposal.forVotes += votes;
        } else {
            proposal.againstVotes += votes;
        }

        emit VoteCast(proposalId, msg.sender, support, votes);
    }

    function executeProposal(uint256 proposalId) external onlyRole(EXECUTOR_ROLE) {
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp >= proposal.endTime, "Gov: voting ongoing");
        require(!proposal.executed && !proposal.canceled, "Gov: not active");
        require(proposal.forVotes > proposal.againstVotes, "Gov: rejected");

        proposal.executed = true;
        (bool success, ) = proposal.target.call(proposal.callData);
        require(success, "Gov: execution failed");

        emit ProposalExecuted(proposalId);
    }

    function cancelProposal(uint256 proposalId) external onlyRole(PROPOSER_ROLE) {
        Proposal storage proposal = proposals[proposalId];
        require(!proposal.executed, "Gov: already executed");
        proposal.canceled = true;
        emit ProposalCanceled(proposalId);
    }

    function setVotingPeriod(uint256 _newPeriod) external onlyRole(DEFAULT_ADMIN_ROLE) {
        votingPeriod = _newPeriod;
        emit VotingPeriodUpdated(_newPeriod);
    }

    function setQuorum(uint256 _newQuorum) external onlyRole(DEFAULT_ADMIN_ROLE) {
        quorum = _newQuorum;
        emit QuorumUpdated(_newQuorum);
    }
}
