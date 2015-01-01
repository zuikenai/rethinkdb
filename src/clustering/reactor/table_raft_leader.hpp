// Copyright 2010-2014 RethinkDB, all rights reserved.
#ifndef CLUSTERING_REACTOR_TABLE_RAFT_LEADER_HPP_
#define CLUSTERING_REACTOR_TABLE_RAFT_LEADER_HPP_

/* `table_meta_manager_t` constructs a `table_raft_leader_t` whenever it is the leader of
the Raft cluster, and deletes it if it is no longer the leader. The `table_raft_leader_t`
has several jobs:

1. It processes user requests to change `table_raft_state_t::config`.

2. It automatically generates Raft transactions to bring `table_raft_state_t::servers`
and the Raft config into sync with `table_raft_state_t::config`.

3. When `table_raft_follower_t` completes a `table_raft_activity_t::stop_t` or
`table_raft_activity_t::backfill_t`, it sends a message to the `table_raft_leader_t`,
which starts a Raft transaction to put a `table_raft_activity_t::done_t` in place. */

class table_raft_leader_t {
public:
    table_raft_leader_t(
        raft_member_t<table_raft_state_t> *_raft);

private:
    void pump(auto_drainer_t::lock_t keepalive);
    void pump_change(

    raft_member_t<table_raft_state_t> *raft;
};

#endif /* CLUSTERING_REACTOR_TABLE_RAFT_LEADER_HPP_ */

