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
    void pump(signal_t *interruptor);
    void pump_add_members(
        raft_member_t<table_raft_state_t>::change_lock_t *cl,
        raft_config_t *ideal_raft_config,
        signal_t *interruptor);
    void pump_activities(
        raft_member_t<table_raft_state_t>::change_lock_t *cl,
        signal_t *interruptor);
    void pump_remove_members(
        raft_member_t<table_raft_state_t>::change_lock_t *cl,
        raft_config_t *ideal_raft_config,
        signal_t *interruptor);

    raft_member_t<table_raft_state_t> *raft;
};

#endif /* CLUSTERING_REACTOR_TABLE_RAFT_LEADER_HPP_ */

