// Copyright 2010-2013 RethinkDB, all rights reserved.
#ifndef RDB_PROTOCOL_TERM_HPP_
#define RDB_PROTOCOL_TERM_HPP_

#include "containers/counted.hpp"
#include "rdb_protocol/error.hpp"
#include "rdb_protocol/ql2.pb.h"

namespace ql {

class datum_stream_t;
class datum_t;
class db_t;
class env_t;
class func_t;
class scope_env_t;
class table_t;
class val_t;
class var_captures_t;
class compile_env_t;

enum eval_flags_t {
    NO_FLAGS = 0,
    LITERAL_OK = 1,
};

// A term with a term_eval function.  These lack the static checking features of
// term_t (is_deterministic, is_blocking, accumulate_captures) because these don't
// exist until run-time (for example, see faux_term_t, created by r.args terms).
class runtime_term_t : public slow_atomic_countable_t<runtime_term_t>,
                       public pb_rcheckable_t {
public:
    virtual ~runtime_term_t() { }

    counted_t<val_t> eval(scope_env_t *env, eval_flags_t eval_flags = NO_FLAGS) const;

protected:
    explicit runtime_term_t(protob_t<const Backtrace> bt);

    virtual const char *name() const = 0;

    // These allocate a new values with this runtime_term_t's backtrace().
    counted_t<val_t> new_val(counted_t<const datum_t> d) const;
    counted_t<val_t> new_val(counted_t<const datum_t> d, counted_t<table_t> t) const;
    counted_t<val_t> new_val(counted_t<const datum_t> d,
                             counted_t<const datum_t> orig_key,
                             counted_t<table_t> t) const;
    counted_t<val_t> new_val(env_t *env, counted_t<datum_stream_t> s) const;
    counted_t<val_t> new_val(counted_t<datum_stream_t> s, counted_t<table_t> t) const;
    counted_t<val_t> new_val(counted_t<const db_t> db) const;
    counted_t<val_t> new_val(counted_t<table_t> t) const;
    counted_t<val_t> new_val(counted_t<func_t> f) const;
    counted_t<val_t> new_val_bool(bool b) const;

private:
    virtual counted_t<val_t> term_eval(scope_env_t *env, eval_flags_t) const = 0;
};

class term_t : public runtime_term_t {
public:
    explicit term_t(protob_t<const Term> _src);
    virtual ~term_t();

    virtual bool is_deterministic() const = 0;

    // RSI: Probably, is_blocking() should be removed.  parallelization_level is
    // where it's at.
    // Returns true if the term is a candidate for being evaluated
    // alongside other terms.
    virtual bool is_blocking() const = 0;

    // Computes the "parallelization level" of a value.
    //
    //  - Non-blocking primitives (like r.add, r.random, etc) have a level of 0, or
    //    the maximum of what their arguments have.
    //
    //  - Operations that go to another table and apply transformations/terminal
    //    operations have a parallelization level of 1 plus the maximum
    //    parallelization level of its transformation/terminal operations.
    //
    //  - The idea here is that we want to evaluate level-1 operations simultaneously
    //    with other level-1 operations.  We don't want to evaluate any other levels
    //    of operation simultaneously with others.  That way, we don't get
    //    exponential growth of parallelization, and the memory usage is also
    //    _relatively close_ to what sequential memory use would be (as opposed to
    //    _extremely far_ from what sequential memory use would be).
    virtual int parallelization_level() const = 0;

    protob_t<const Term> get_src() const;
    void prop_bt(Term *t) const;

    virtual void accumulate_captures(var_captures_t *captures) const = 0;

private:
    protob_t<const Term> src;

    DISABLE_COPYING(term_t);
};

counted_t<const term_t> compile_term(compile_env_t *env, protob_t<const Term> t);

} // namespace ql

#endif // RDB_PROTOCOL_TERM_HPP_
