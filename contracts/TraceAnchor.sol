// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TraceAnchor — minimal evidence-root commitment registry for TRACE.
/// @notice Stores ONLY commitments (hashes + version strings). Raw images,
///         face embeddings, and personal data must never be submitted.
contract TraceAnchor {
    struct Anchor {
        bytes32 investigationIdHash;
        uint64 timestamp;
        string schemaVersion;
        string appVersion;
        bool exists;
    }

    mapping(bytes32 => Anchor) private _anchors;

    event EvidenceAnchored(
        bytes32 indexed evidenceRoot,
        bytes32 indexed investigationIdHash,
        uint64 timestamp
    );

    error AlreadyAnchored(bytes32 evidenceRoot);
    error InvalidRoot();
    error InvalidInvestigation();

    /// @notice Commit an evidence root. Each root anchors at most once.
    function anchorEvidence(
        bytes32 evidenceRoot,
        bytes32 investigationIdHash,
        string calldata schemaVersion,
        string calldata appVersion
    ) external {
        if (evidenceRoot == bytes32(0)) revert InvalidRoot();
        if (investigationIdHash == bytes32(0)) revert InvalidInvestigation();
        if (_anchors[evidenceRoot].exists) revert AlreadyAnchored(evidenceRoot);
        _anchors[evidenceRoot] = Anchor({
            investigationIdHash: investigationIdHash,
            timestamp: uint64(block.timestamp),
            schemaVersion: schemaVersion,
            appVersion: appVersion,
            exists: true
        });
        emit EvidenceAnchored(evidenceRoot, investigationIdHash, uint64(block.timestamp));
    }

    function getAnchor(
        bytes32 evidenceRoot
    )
        external
        view
        returns (
            bytes32 investigationIdHash,
            uint64 timestamp,
            string memory schemaVersion,
            string memory appVersion,
            bool exists
        )
    {
        Anchor storage a = _anchors[evidenceRoot];
        return (a.investigationIdHash, a.timestamp, a.schemaVersion, a.appVersion, a.exists);
    }

    function verifyAnchor(
        bytes32 evidenceRoot,
        bytes32 investigationIdHash
    ) external view returns (bool anchored) {
        Anchor storage a = _anchors[evidenceRoot];
        return a.exists && a.investigationIdHash == investigationIdHash;
    }
}
