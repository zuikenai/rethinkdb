// Copyright 2010-2014 RethinkDB, all rights reserved.
#include "clustering/reactor/table_raft.hpp"

void table_raft_state_t::apply_change(const change_t &change) {
    class visitor_t : public boost::static_visitor<void> {
    public:
        void operator()(const table_raft_change_t::activity_t &c) {
            server_t *server = &s->servers.at(c.server);
            server->activities.update(c.activities);
            for (const auto &pair : c.new_branches.branches) {
                auto res = s.branches.branches.insert(pair);
                guarantee(res.second, "This branch ID is already in use.");
            }
        }
        void operator()(const table_raft_change_t::add_server_t &c) {
            guarantee(s->servers.count(c.server) == 0);
            s->servers[c.server].member_id = c.member_id;
            s->servers[c.server].activities = c.activities;
        }
        void operator()(const table_raft_change_t::remove_server_t &c) {
            guarantee(s->servers.count(c.server) == 1);
            s->servers.erase(c.server);
        }
        table_raft_state_t *s;
    } visitor;
    visitor.s = this;
    boost::apply_visitor(visitor, change.v);
}

bool pump_table_raft(
        raft_member_t<table_raft_state_t> *raft,
        signal_t *soft_interruptor,
        signal_t *hard_interruptor) {
    table_raft_pump_result_t result;

    raft_member_t<table_raft_state_t>::state_and_config_t s =
        raft->get_latest_state()->get();

    /* If any server is in the `table_config_t` but not in the `servers` map, then make
    an entry in the `servers` map */
    for (const table_config_t::shard_t &shard : s.state.config.shards) {
        for (const server_id_t &server : shard.replicas) {
            auto it = s.state.servers.find(server);
            if (it == s.state.servers.end()) {
                table_raft_change_t::add_server_t c;
                c.server = server;
                c.member_id = generate_uuid();
                c.activities.set(region_t::universe(),
                    table_raft_activity_t(table_raft_activity_t::stop_t()));
                raft->propose_change(
                    table_raft_change_t(c),
                    raft_member_t<table_raft_state_t>::dont_wait,
                    soft_interruptor,
                    hard_interruptor);
                ...
            } else if (!s.config.is_joint_consensus() && !it->config.
        }
    }

    /* If any server(s) are in the `table_config_t` and the  `servers` map but not in the Raft configuration, then
    add them to the Raft configuration */
    for (const auto &pair : 
}

