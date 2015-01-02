// Copyright 2010-2014 RethinkDB, all rights reserved.
#include "clustering/reactor/table_raft_leader.hpp"

void table_raft_leader_t::pump(signal_t *interruptor) {
    raft_member_t<table_raft_state_t>::change_lock_t cl(raft, interruptor);

    /* Nothing in `pump()` changes the `table_config_t`, so we can cache the set of
    servers up here. */
    std::set<server_id_t> table_config_servers;
    for (const table_config_t::shard_t &shard :
            cl.get_latest_state().state.config.shards) {
        all_servers.insert(shard.replicas.begin(), shard.replicas.end());
    }

    /* Since config changes don't pipeline well, we want to bundle them together if
    possible. We'll make changes locally to `ideal_config`, and then at the end we'll
    propose a single config change transaction if anything is different. */
    raft_config_t ideal_raft_config = cl.get_latest_state().config.config;

void pump_add_members(
        raft_member_t<table_raft_state_t>::change_lock_t *cl,
        raft_config_t *ideal_raft_config,
        signal_t *interruptor) {

    std::set<server_id_t> table_config_servers;
    for (const table_config_t::shard_t &shard :
            cl->get_latest_state().state.config.shards) {
        all_servers.insert(shard.replicas.begin(), shard.replicas.end());
    }

    for (const server_id_t &server_id : table_config_servers) {
        raft_member_id_t member_id;

        /* If the server is in the `table_config_t` but not the `servers` map, then
        add an entry to the `servers` map */
        auto it = cl->get_latest_state().state.servers.find(server_id);
        if (it == cl->get_latest_state().state.servers.end()) {
            table_raft_change_t::add_server_t c;
            c.server = server_id;
            c.member_id = member_id = generate_uuid();
            /* Setting the new server's initial activity to `stop_t` means that it
            will report back with its current version on disk, and we can proceed
            from there. */
            c.activities.set(region_t::universe(),
                table_raft_activity_t(table_raft_activity_t::stop_t()));
            raft->propose_change(cl, table_raft_change_t(c), interruptor);
        } else {
            member_id = it->second.member_id;
        }

        /* If the server is in the `table_config_t` but not the Raft configuration,
        then add it to the Raft configuration. */
        if (!ideal_raft_config->is_member(member_id)) {
            ideal_raft_config->non_voting_members.insert(member_id);
        }
    }
}

    /* This block deals with assigning new activities to existing servers that are
    already in the cluster. This is the "nerve center" for the replication logic. */
    {
        table_config_t config = cl.get_latest_state().state.config;
        for (const table_config_t::shard_t &shard : config.shards) {
            region_map_t<version_t> versions;
            bool all_done = true;
            
        }
    }

void pump_remove_members(
        raft_member_t<table_raft_state_t>::change_lock_t *cl,
        raft_config_t *ideal_raft_config,
        signal_t *interruptor) {

    std::set<server_id_t> table_config_servers;
    for (const table_config_t::shard_t &shard :
            cl->get_latest_state().state.config.shards) {
        all_servers.insert(shard.replicas.begin(), shard.replicas.end());
    }

    table_raft_state_t temp_state = cl->get_latest_state().state;
    for (const auto &pair : temp_state.servers) {
        if (table_config_servers.count(pair.first) == 1) {
            continue;
        }
        bool any_data_left = false;
        for (const auto &act_pair : temp_state.activities) {
            if (!boost::get<table_raft_activity_t::nothing_t>(&act_pair.second.v)) {
                any_data_left = true;
            }
        }
        if (any_data_left) {
            continue;
        }
        /* The server is not in the `table_config_t` and it doesn't have any data
        left (that we care about). But it's still in the `servers` map. */
        if (ideal_raft_config.is_member(pair.second.member_id)) {
            /* Remove the server from the Raft configuration. */
            ideal_raft_config.voting_members.erase(pair.second.member_id);
            ideal_raft_config.non_voting_members.erase(pair.second.member_id);
        } else {
            /* Remove the server from the `servers` map. Note that we don't do this
            if the server is still in the Raft configuration; this ensures that the
            server will never see a Raft state in which it is absent from the
            `servers` map. */
            table_raft_chagne_t::remove_server_t c;
            c.server = server_id;
            raft->propose_change(cl, table_raft_change_t(c), interruptor);
        }
    }
}

