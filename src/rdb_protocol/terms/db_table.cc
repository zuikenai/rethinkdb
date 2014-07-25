// Copyright 2010-2013 RethinkDB, all rights reserved.
#include "rdb_protocol/terms/terms.hpp"

#include <map>
#include <string>

#include "containers/name_string.hpp"
#include "containers/wire_string.hpp"
#include "rdb_protocol/op.hpp"
#include "rdb_protocol/wait_for_readiness.hpp"

namespace ql {

durability_requirement_t parse_durability_optarg(counted_t<val_t> arg,
                                                 const pb_rcheckable_t *target);

name_string_t get_name(counted_t<val_t> val, const term_t *caller,
        const char *type_str) {
    r_sanity_check(val.has());
    const wire_string_t &raw_name = val->as_str();
    name_string_t name;
    bool assignment_successful = name.assign_value(raw_name);
    rcheck_target(caller, base_exc_t::GENERIC, assignment_successful,
                  strprintf("%s name `%s` invalid (%s).",
                            type_str, raw_name.c_str(), name_string_t::valid_char_msg));
    return name;
}

// Meta operations (BUT NOT TABLE TERMS) should inherit from this.
class meta_op_term_t : public op_term_t {
public:
    meta_op_term_t(compile_env_t *env, protob_t<const Term> term, argspec_t argspec,
              optargspec_t optargspec = optargspec_t({}))
        : op_term_t(env, std::move(term), std::move(argspec), std::move(optargspec)) { }

private:
    bool op_is_deterministic() const FINAL { return false; }
};

class meta_write_op_t : public meta_op_term_t {
public:
    meta_write_op_t(compile_env_t *env, protob_t<const Term> term, argspec_t argspec,
                    optargspec_t optargspec = optargspec_t({}))
        : meta_op_term_t(env, std::move(term), std::move(argspec), std::move(optargspec)) { }

private:
    virtual std::string write_eval_impl(scope_env_t *env,
                                        args_t *args,
                                        eval_flags_t flags) const = 0;
    counted_t<val_t> eval_impl(scope_env_t *env, args_t *args, eval_flags_t flags) const FINAL {
        std::string op = write_eval_impl(env, args, flags);
        datum_object_builder_t res;
        UNUSED bool b = res.add(op, make_counted<datum_t>(1.0));
        return new_val(std::move(res).to_counted());
    }
};

class db_term_t : public meta_op_term_t {
public:
    db_term_t(compile_env_t *env, const protob_t<const Term> &term) : meta_op_term_t(env, term, argspec_t(1)) { }
private:
    counted_t<val_t> eval_impl(scope_env_t *env, args_t *args, eval_flags_t) const FINAL {
        name_string_t db_name = get_name(args->arg(env, 0), this, "Database");
        counted_t<const db_t> db;
        std::string error;
        if (!env->env->reql_admin_interface()->db_find(db_name, env->env->interruptor,
                &db, &error)) {
            rfail(base_exc_t::GENERIC, "%s", error.c_str());
        }
        return new_val(db);
    }
    const char *name() const FINAL { return "db"; }

    // An r.db('aaa') term doesn't do any blocking... but the subsequent table term
    // might.
    int parallelization_level() const FINAL {
        return params_parallelization_level();
    }
};

class db_create_term_t : public meta_write_op_t {
public:
    db_create_term_t(compile_env_t *env, const protob_t<const Term> &term) :
        meta_write_op_t(env, term, argspec_t(1)) { }
private:
    std::string write_eval_impl(scope_env_t *env, args_t *args, eval_flags_t) const FINAL {
        name_string_t db_name = get_name(args->arg(env, 0), this, "Database");
        std::string error;
        if (!env->env->reql_admin_interface()->db_create(db_name, env->env->interruptor,
                &error)) {
            rfail(base_exc_t::GENERIC, "%s", error.c_str());
        }
        return "created";
    }
    const char *name() const FINAL { return "db_create"; }

    int parallelization_level() const FINAL {
        // Creating a db blocks, so it has (at least) a parallelization level of 1.
        return std::max(1, params_parallelization_level());
    }
};

bool is_hard(durability_requirement_t requirement) {
    switch (requirement) {
    case DURABILITY_REQUIREMENT_DEFAULT:
    case DURABILITY_REQUIREMENT_HARD:
        return true;
    case DURABILITY_REQUIREMENT_SOFT:
        return false;
    default:
        unreachable();
    }
}

class table_create_term_t : public meta_write_op_t {
public:
    table_create_term_t(compile_env_t *env, const protob_t<const Term> &term) :
        meta_write_op_t(env, term, argspec_t(1, 2),
                        optargspec_t({"datacenter", "primary_key", "durability"})) { }
private:
    std::string write_eval_impl(scope_env_t *env, args_t *args, eval_flags_t) const FINAL {

        /* Parse arguments */
        boost::optional<name_string_t> primary_dc;
        if (counted_t<val_t> v = args->optarg(env, "datacenter")) {
            primary_dc.reset(get_name(v, this, "Table"));
        }

        const bool hard_durability
            = is_hard(parse_durability_optarg(args->optarg(env, "durability"), this));

        std::string primary_key = "id";
        if (counted_t<val_t> v = args->optarg(env, "primary_key")) {
            primary_key = v->as_str().to_std();
        }

        counted_t<const db_t> db;
        name_string_t tbl_name;
        if (args->num_args() == 1) {
            counted_t<val_t> dbv = args->optarg(env, "db");
            r_sanity_check(dbv);
            db = dbv->as_db();
            tbl_name = get_name(args->arg(env, 0), this, "Table");
        } else {
            db = args->arg(env, 0)->as_db();
            tbl_name = get_name(args->arg(env, 1), this, "Table");
        }

        /* Create the table */
        uuid_u namespace_id;
        std::string error;
        if (!env->env->reql_admin_interface()->table_create(tbl_name, db,
                primary_dc, hard_durability, primary_key,
                env->env->interruptor, &namespace_id, &error)) {
            rfail(base_exc_t::GENERIC, "%s", error.c_str());
        }

        // UGLY HACK BELOW (see wait_for_rdb_table_readiness)

        try {
            wait_for_rdb_table_readiness(env->env->ns_repo(), namespace_id,
                                         env->env->interruptor);
        } catch (const interrupted_exc_t &e) {
            rfail(base_exc_t::GENERIC, "Query interrupted, probably by user.");
        }

        return "created";
    }
    const char *name() const FINAL { return "table_create"; }

    // Creating a table blocks.
    int parallelization_level() const {
        return std::max(1, params_parallelization_level());
    }
};

class db_drop_term_t : public meta_write_op_t {
public:
    db_drop_term_t(compile_env_t *env, const protob_t<const Term> &term) :
        meta_write_op_t(env, term, argspec_t(1)) { }
private:
    std::string write_eval_impl(scope_env_t *env, args_t *args, eval_flags_t) const FINAL {
        name_string_t db_name = get_name(args->arg(env, 0), this, "Database");

        std::string error;
        if (!env->env->reql_admin_interface()->db_drop(db_name,
                env->env->interruptor, &error)) {
            rfail(base_exc_t::GENERIC, "%s", error.c_str());
        }

        return "dropped";
    }
    const char *name() const FINAL { return "db_drop"; }

    // Dropping a db blocks.
    int parallelization_level() const FINAL {
        return std::max(1, params_parallelization_level());
    }
};

class table_drop_term_t : public meta_write_op_t {
public:
    table_drop_term_t(compile_env_t *env, const protob_t<const Term> &term) :
        meta_write_op_t(env, term, argspec_t(1, 2)) { }
private:
    std::string write_eval_impl(scope_env_t *env, args_t *args, eval_flags_t) const FINAL {
        counted_t<const db_t> db;
        name_string_t tbl_name;
        if (args->num_args() == 1) {
            counted_t<val_t> dbv = args->optarg(env, "db");
            r_sanity_check(dbv);
            db = dbv->as_db();
            tbl_name = get_name(args->arg(env, 0), this, "Table");
        } else {
            db = args->arg(env, 0)->as_db();
            tbl_name = get_name(args->arg(env, 1), this, "Table");
        }

        std::string error;
        if (!env->env->reql_admin_interface()->table_drop(tbl_name, db,
                env->env->interruptor, &error)) {
            rfail(base_exc_t::GENERIC, "%s", error.c_str());
        }

        return "dropped";
    }
    const char *name() const FINAL { return "table_drop"; }

    // Dropping a table blocks.
    int parallelization_level() const FINAL {
        return std::max(1, params_parallelization_level());
    }
};

class db_list_term_t : public meta_op_term_t {
public:
    db_list_term_t(compile_env_t *env, const protob_t<const Term> &term) :
        meta_op_term_t(env, term, argspec_t(0)) { }
private:
    counted_t<val_t> eval_impl(scope_env_t *env, args_t *, eval_flags_t) const FINAL {
        std::set<name_string_t> dbs;
        std::string error;
        if (!env->env->reql_admin_interface()->db_list(
                env->env->interruptor, &dbs, &error)) {
            rfail(base_exc_t::GENERIC, "%s", error.c_str());
        }

        std::vector<counted_t<const datum_t> > arr;
        arr.reserve(dbs.size());
        for (auto it = dbs.begin(); it != dbs.end(); ++it) {
            arr.push_back(make_counted<datum_t>(std::string(it->str())));
        }

        return new_val(make_counted<const datum_t>(std::move(arr)));
    }
    const char *name() const FINAL { return "db_list"; }

    int parallelization_level() const FINAL {
        return params_parallelization_level();
    }
};

class table_list_term_t : public meta_op_term_t {
public:
    table_list_term_t(compile_env_t *env, const protob_t<const Term> &term) :
        meta_op_term_t(env, term, argspec_t(0, 1)) { }
private:
    counted_t<val_t> eval_impl(scope_env_t *env, args_t *args, eval_flags_t) const FINAL {
        counted_t<const ql::db_t> db;
        if (args->num_args() == 0) {
            counted_t<val_t> dbv = args->optarg(env, "db");
            r_sanity_check(dbv);
            db = dbv->as_db();
        } else {
            db = args->arg(env, 0)->as_db();
        }

        std::set<name_string_t> tables;
        std::string error;
        if (!env->env->reql_admin_interface()->table_list(db,
                env->env->interruptor, &tables, &error)) {
            rfail(base_exc_t::GENERIC, "%s", error.c_str());
        }

        std::vector<counted_t<const datum_t> > arr;
        arr.reserve(tables.size());
        for (auto it = tables.begin(); it != tables.end(); ++it) {
            arr.push_back(make_counted<datum_t>(std::string(it->str())));
        }
        return new_val(make_counted<const datum_t>(std::move(arr)));
    }
    const char *name() const FINAL { return "table_list"; }

    int parallelization_level() const FINAL {
        return params_parallelization_level();
    }
};

class sync_term_t : public meta_write_op_t {
public:
    sync_term_t(compile_env_t *env, const protob_t<const Term> &term)
        : meta_write_op_t(env, term, argspec_t(1)) { }

private:
    std::string write_eval_impl(scope_env_t *env, args_t *args, eval_flags_t) const FINAL {
        counted_t<table_t> t = args->arg(env, 0)->as_table();
        bool success = t->sync(env->env, this);
        r_sanity_check(success);
        return "synced";
    }
    const char *name() const FINAL { return "sync"; }

    int parallelization_level() const FINAL {
        // This inherits the parallelization level from its left-hand table argument.
        return params_parallelization_level();
    }
};

class table_term_t : public op_term_t {
public:
    table_term_t(compile_env_t *env, const protob_t<const Term> &term)
        : op_term_t(env, term, argspec_t(1, 2), optargspec_t({ "use_outdated" })) { }
private:
    counted_t<val_t> eval_impl(scope_env_t *env, args_t *args, eval_flags_t) const FINAL {
        counted_t<val_t> t = args->optarg(env, "use_outdated");
        bool use_outdated = t ? t->as_bool() : false;
        counted_t<const db_t> db;
        std::string name;
        if (args->num_args() == 1) {
            counted_t<val_t> dbv = args->optarg(env, "db");
            r_sanity_check(dbv.has());
            db = dbv->as_db();
            name = args->arg(env, 0)->as_str().to_std();
        } else {
            r_sanity_check(args->num_args() == 2);
            db = args->arg(env, 0)->as_db();
            name = args->arg(env, 1)->as_str().to_std();
        }
        return new_val(make_counted<table_t>(
                           env->env, db, name, use_outdated, backtrace()));
    }
    bool op_is_deterministic() const FINAL { return false; }
    const char *name() const FINAL { return "table"; }

    // This is a bit icky, because the exact sort of parallelization depends on
    // the operation that's attached to the table.  An operation which treats the
    // table like a selection will be more expensive (if we start taking that into
    // account) than a .get operation (that retrieves one row).  Maybe we don't
    // really want to parallelize expensive rget operations.  On the other hand,
    // maybe we'd benefit an extreme amount from that (especially if they're
    // traversing the same table at the same time).  (But maybe that can be handled
    // by an info_term_t or a get_term_t if those can only operate on tables.)

    // Getting a result set or a row from a table can block.
    int parallelization_level() const FINAL {
        return std::max(1, params_parallelization_level());
    }
};

class get_term_t : public op_term_t {
public:
    get_term_t(compile_env_t *env, const protob_t<const Term> &term) : op_term_t(env, term, argspec_t(2)) { }
private:
    counted_t<val_t> eval_impl(scope_env_t *env, args_t *args, eval_flags_t) const FINAL {
        counted_t<table_t> table = args->arg(env, 0)->as_table();
        counted_t<const datum_t> pkey = args->arg(env, 1)->as_datum();
        counted_t<const datum_t> row = table->get_row(env->env, pkey);
        return new_val(row, pkey, table);
    }
    const char *name() const FINAL { return "get"; }

    bool op_is_deterministic() const FINAL { return true; }

    int parallelization_level() const FINAL {
        // We inherit the parallelization level from the left-hand table expression.
        return params_parallelization_level();
    }
};

class get_all_term_t : public op_term_t {
public:
    get_all_term_t(compile_env_t *env, const protob_t<const Term> &term)
        : op_term_t(env, term, argspec_t(2, -1), optargspec_t({ "index" })) { }
private:
    counted_t<val_t> eval_impl(scope_env_t *env, args_t *args, eval_flags_t) const FINAL {
        counted_t<table_t> table = args->arg(env, 0)->as_table();
        counted_t<val_t> index = args->optarg(env, "index");
        std::string index_str = index ? index->as_str().to_std() : "";
        if (index && index_str != table->get_pkey()) {
            std::vector<counted_t<datum_stream_t> > streams;
            for (size_t i = 1; i < args->num_args(); ++i) {
                counted_t<const datum_t> key = args->arg(env, i)->as_datum();
                counted_t<datum_stream_t> seq =
                    table->get_all(env->env, key, index_str, backtrace());
                streams.push_back(seq);
            }
            counted_t<datum_stream_t> stream
                = make_counted<union_datum_stream_t>(std::move(streams), backtrace());
            return new_val(stream, table);
        } else {
            datum_array_builder_t arr;
            for (size_t i = 1; i < args->num_args(); ++i) {
                counted_t<const datum_t> key = args->arg(env, i)->as_datum();
                counted_t<const datum_t> row = table->get_row(env->env, key);
                if (row->get_type() != datum_t::R_NULL) {
                    arr.add(row);
                }
            }
            counted_t<datum_stream_t> stream
                = make_counted<array_datum_stream_t>(std::move(arr).to_counted(),
                                                     backtrace());
            return new_val(stream, table);
        }
    }
    const char *name() const FINAL { return "get_all"; }

    // Right now, because the left-hand argument is a table,
    // op_term_t::is_deterministic will return false anyway.  However, if it becomse
    // possible for a "deterministic table" to exist, we'll still be
    // non-deterministic unless you can prove otherwise, because the relative order
    // of elements having equal secondary index keys is not rock-solidly well-defined.
    bool op_is_deterministic() const FINAL {
        // RSI: This should check if the "index" optarg exists, and return true if it
        // doesn't, because getting a bunch of rows should be o.k.
        return false;
    }

    int parallelization_level() const FINAL {
        // This inherits the parallelization level from the left-hand table
        // expression (or from its argument expression, if one of those is crazily
        // parallelizable).
        return params_parallelization_level();
    }
};

counted_t<term_t> make_db_term(compile_env_t *env, const protob_t<const Term> &term) {
    return make_counted<db_term_t>(env, term);
}

counted_t<term_t> make_table_term(compile_env_t *env, const protob_t<const Term> &term) {
    return make_counted<table_term_t>(env, term);
}

counted_t<term_t> make_get_term(compile_env_t *env, const protob_t<const Term> &term) {
    return make_counted<get_term_t>(env, term);
}

counted_t<term_t> make_get_all_term(compile_env_t *env, const protob_t<const Term> &term) {
    return make_counted<get_all_term_t>(env, term);
}

counted_t<term_t> make_db_create_term(compile_env_t *env, const protob_t<const Term> &term) {
    return make_counted<db_create_term_t>(env, term);
}

counted_t<term_t> make_db_drop_term(compile_env_t *env, const protob_t<const Term> &term) {
    return make_counted<db_drop_term_t>(env, term);
}

counted_t<term_t> make_db_list_term(compile_env_t *env, const protob_t<const Term> &term) {
    return make_counted<db_list_term_t>(env, term);
}

counted_t<term_t> make_table_create_term(compile_env_t *env, const protob_t<const Term> &term) {
    return make_counted<table_create_term_t>(env, term);
}

counted_t<term_t> make_table_drop_term(compile_env_t *env, const protob_t<const Term> &term) {
    return make_counted<table_drop_term_t>(env, term);
}

counted_t<term_t> make_table_list_term(compile_env_t *env, const protob_t<const Term> &term) {
    return make_counted<table_list_term_t>(env, term);
}

counted_t<term_t> make_sync_term(compile_env_t *env, const protob_t<const Term> &term) {
    return make_counted<sync_term_t>(env, term);
}



} // namespace ql
