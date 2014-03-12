// Copyright 2010-2013 RethinkDB, all rights reserved.
#include "rdb_protocol/terms/terms.hpp"

#include "rdb_protocol/error.hpp"
#include "rdb_protocol/func.hpp"
#include "rdb_protocol/op.hpp"

namespace ql {

class error_term_t : public op_term_t {
public:
    error_term_t(compile_env_t *env, const protob_t<const Term> &term)
        : op_term_t(env, term, argspec_t(0, 1)) { }
private:
    virtual counted_t<val_t> eval_impl(scope_env_t *env, UNUSED eval_flags_t flags) {
        if (num_args() == 0) {
            rfail(base_exc_t::EMPTY_USER, "Empty ERROR term outside a default block.");
        } else {
            rfail(base_exc_t::GENERIC, "%s", arg(env, 0)->as_str().c_str());
        }
    }
    virtual const char *name() const { return "error"; }
};

class default_term_t : public op_term_t {
public:
    default_term_t(compile_env_t *env, const protob_t<const Term> &term)
        : op_term_t(env, term, argspec_t(2)) { }
private:
    counted_t<val_t>
    default_value(counted_t<const datum_t> &&func_arg, scope_env_t *env, const exc_t *err) {
        r_sanity_check(func_arg.has());
        r_sanity_check(func_arg->get_type() == datum_t::R_NULL
                       || func_arg->get_type() == datum_t::R_STR);

        try {
            counted_t<val_t> def = arg(env, 1);
            if (def->get_type().is_convertible(val_t::type_t::FUNC)) {
                return def->as_func()->call(env->env, func_arg);
            } else {
                return def;
            }
        } catch (const base_exc_t &e) {
            if (e.get_type() == base_exc_t::EMPTY_USER) {
                if (err != NULL) {
                    throw *err;
                } else {
                    // TODO this behaviour seems unintuitive to me
                    //      null.default(r.error()) -> null
                    r_sanity_check(func_arg->get_type() == datum_t::R_NULL);
                    return make_counted<val_t>(func_arg, backtrace());
                }
            } else {
                throw;
            }
        }

    }

    counted_t<val_t>
    handle_non_existence(counted_t<const datum_t> &&d, scope_env_t *env) {
        if (d->get_type() != datum_t::R_NULL) {
            return make_counted<val_t>(d, backtrace());
        }
        return default_value(std::move(d), env, NULL);
    }

    counted_t<val_t> handle_non_existence(const exc_t &e, scope_env_t *env) {
        if (e.get_type() == base_exc_t::NON_EXISTENCE) {
            return default_value(make_counted<const datum_t>(e.what()), env, &e);
        }
        throw e;
    }

    counted_t<val_t>
    handle_non_existence(exc_wrapper_t<counted_t<const datum_t> > &&ew, scope_env_t *env) {
        if (ew.has_exc()) {
            return handle_non_existence(ew.get_exc(), env);
        } else {
            return handle_non_existence(std::move(*ew), env);
        }
    }

    virtual counted_t<val_t> eval_impl(scope_env_t *env, UNUSED eval_flags_t flags) {
        counted_t<val_t> v;
        counted_t<const datum_t> d;
        counted_t<grouped_data_t> gd;
        try {
            v = arg(env, 0);

            gd = v->maybe_as_promiscuous_grouped_data(env->env);

            if (!gd.has() && v->get_type().is_convertible(val_t::type_t::DATUM)) {
                d = v->as_datum();
            }

        } catch (const exc_t &e) {
            return handle_non_existence(e, env);

        } catch (const datum_exc_t &e) {
            exc_t err(e.get_type(), e.what(), backtrace().get());
            return handle_non_existence(err, env);
        }

        if (gd.has()) {
            for (auto kv = gd->begin(); kv != gd->end(); ++kv) {
                kv->second = handle_non_existence(std::move(kv->second), env)->as_datum();
            }
            return make_counted<val_t>(gd, backtrace());
        } else if (d.has()) {
            return handle_non_existence(v->as_datum(), env);
        } else {
            return v;
        }
    }
    virtual const char *name() const { return "default"; }
    virtual bool can_be_grouped() { return false; }
};

counted_t<term_t> make_error_term(compile_env_t *env, const protob_t<const Term> &term) {
    return make_counted<error_term_t>(env, term);
}
counted_t<term_t> make_default_term(compile_env_t *env, const protob_t<const Term> &term) {
    return make_counted<default_term_t>(env, term);
}


} // namespace ql
