// Copyright 2010-2014 RethinkDB, all rights reserved.
#ifndef CLUSTERING_REACTOR_TABLE_RAFT_HPP_
#define CLUSTERING_REACTOR_TABLE_RAFT_HPP_

class table_raft_activity_t {
public:
    class primary_t {
    public:
        branch_id_t branch_id;
    };
    class secondary_t {
    public:
        branch_id_t branch_id;
    };
    class backfill_t {
    public:
        server_id_t source;
    };
    class stop_t {
    };
    class done_t {
    public:
        version_t version;
    };
    template<class T>
    explicit table_raft_change_t(T &&t) : v(t) { }
    boost::variant<primary_t, secondary_t, backfill_t, stop_t, done_t> v;
};

class table_raft_change_t {
public:
    class activity_t {
    public:
        server_id_t server;
        region_map_t<table_raft_activity_t> activities;
        branch_history_t new_branches;
    };
    class add_server_t {
    public:
        server_id_t server;
        raft_member_id_t member_id;
        region_map_t<table_raft_activity_t> activities;
    };
    class remove_server_t {
    public:
        server_id_t server;
    };
    class change_config_t {
    public:
        table_config_t new_config;
    };
    template<class T>
    explicit table_raft_change_t(T &&t) : v(t) { }
    boost::variant<activity_t, add_server_t, remove_server_t, change_config_t> v;
};

class table_raft_state_t {
public:
    typedef table_raft_change_t change_t;

    class server_t {
    public:
        raft_member_id_t member_id;
        region_map_t<table_raft_activity_t> activities;
    };

    void apply_change(const change_t &change);

    table_config_t config;

    std::map<server_id_t, server_t> servers;

    branch_history_t branches;
};

#endif /* CLUSTERING_REACTOR_TABLE_RAFT_HPP_ */

