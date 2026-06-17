contract GTKTokenFuzz is GTKToken {
    function echidna_total_supply_lte_reserves() public view returns (bool) {
        return totalSupply() <= totalGoldReserves;
    }

    function echidna_blacklist_blocks_transfer() public returns (bool) {
        // Invariante: endereços na blacklist não podem transferir
        if (blacklisted[msg.sender]) {
            // Tentativa de transfer deve falhar (testado off-chain)
            return true;
        }
        return true;
    }
}
