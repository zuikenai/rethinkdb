// Copyright 2010-2014 RethinkDB, all rights reserved.
#include <stdint.h>

#include <string>
#include "debug.hpp"

#include "rdb_protocol/error.hpp"
#include "rdb_protocol/func.hpp"
#include "rdb_protocol/op.hpp"
#include "rdb_protocol/terms/terms.hpp"
#include "extproc/http_runner.hpp"

namespace ql {

class http_result_visitor_t : public boost::static_visitor<counted_t<val_t> > {
public:
    explicit http_result_visitor_t(const pb_rcheckable_t *_parent) :
          parent(_parent) { }

    // This http resulted in an error
    counted_t<val_t> operator()(const std::string &err_val) const {
        rfail_target(parent, base_exc_t::GENERIC, "%s", err_val.c_str());
        unreachable();
    }

    // This http resulted in data
    counted_t<val_t> operator()(const counted_t<const datum_t> &datum) const {
        return make_counted<val_t>(datum, parent->backtrace());
    }

private:
    const pb_rcheckable_t *parent;
};

class http_term_t : public op_term_t {
public:
    http_term_t(compile_env_t *env, const protob_t<const Term> &term) :
        op_term_t(env, term, argspec_t(1, -1),
                  optargspec_t({"body",
                                "timeout",
                                "method",
                                "params",
                                "header",
                                "attempts",
                                "allow_redirect",
                                "verify",
                                "depaginate",
                                "auth",
                                "result_format" }))
    { }
private:
    void get_timeout(scope_env_t *env, uint64_t *timeout_out) {
        counted_t<val_t> timeout = optarg(env, "timeout");
        if (timeout.has()) {
            counted_t<const datum_t> datum_timeout = timeout->as_datum();
            if (datum_timeout->get_type() != datum_t::R_STR) {
                rfail_target(this, base_exc_t::GENERIC,
                             "Expected `timeout` to be a NUMBER, but found %s.",
                             datum_timeout->get_type_name().c_str());
            }

            if (datum_timeout->as_num() > static_cast<double>(UINT64_MAX) / 1000) {
                *timeout_out = UINT64_MAX;
            } else {
                *timeout_out = datum_timeout->as_num() * 1000;
            }
        }
    }

    void get_header(scope_env_t *env, std::string *header_out) {
        counted_t<val_t> header = optarg(env, "header");
        if (header.has()) {
            counted_t<const datum_t> datum_header = header->as_datum();
            if (datum_header->get_type() == datum_t::R_STR) {
                header_out->assign(datum_header->as_str().to_std());
            } else if (datum_header->get_type() == datum_t::R_OBJECT) {
                const std::map<std::string, counted_t<const datum_t> > &header_map = datum_header->as_object();
                for (auto it = header_map.begin(); it != header_map.end(); ++it) {
                    if (it->second->get_type() != datum_t::R_STR) {
                        rfail_target(this, base_exc_t::GENERIC,
                                     "Expected `header.%s` to be a STRING, but found %s.",
                                     it->first.c_str(), it->second->get_type_name().c_str());
                    }
                    header_out->append(strprintf("\n%s: %s", it->first.c_str(),
                                                 it->second->as_str().c_str()));
                }
            } else {
                rfail_target(this, base_exc_t::GENERIC,
                             "Expected `header` to be a STRING or OBJECT, but found %s.",
                             datum_header->get_type_name().c_str());
            }
        }
    }

    void get_method(scope_env_t *env, http_method_t *method_out) {
        counted_t<val_t> method = optarg(env, "method");
        if (method.has()) {
            counted_t<const datum_t> datum_method = method->as_datum();
            if (datum_method->get_type() != datum_t::R_STR) {
                rfail_target(this, base_exc_t::GENERIC,
                             "Expected `method` to be a STRING, but found %s.",
                             datum_method->get_type_name().c_str());
            }

            std::string method_str = datum_method->as_str().to_std();
            if (method_str == "GET") {
                *method_out = http_method_t::GET;
            } else if (method_str == "HEAD") {
                *method_out = http_method_t::HEAD;
            } else if (method_str == "PUT") {
                *method_out = http_method_t::PUT;
            } else if (method_str == "POST") {
                *method_out = http_method_t::POST;
            } else if (method_str == "DELETE") {
                *method_out = http_method_t::DELETE;
            } else {
                rfail_target(this, base_exc_t::GENERIC,
                             "`method` (%s) is not recognized ('GET', 'HEAD', 'PUT', 'POST', and 'DELETE' are allowed).",
                             method_str.c_str());
            }
        }
    }

    void get_auth_item(const counted_t<const datum_t> &datum,
                       const std::string &name,
                       std::string *str_out) {
        counted_t<const datum_t> item = datum->get(name, NOTHROW);
        if (!item.has()) {
            rfail_target(this, base_exc_t::GENERIC,
                         "`auth.%s` not found in the auth object.", name.c_str());
        } else if (item->get_type() != datum_t::R_STR) {
            rfail_target(this, base_exc_t::GENERIC,
                         "Expected `auth.%s` to be a STRING, but found %s.",
                         name.c_str(), item->get_type_name().c_str());
        }
        str_out->assign(item->as_str().to_std());
    }

    void get_auth(scope_env_t *env, http_opts_t::http_auth_t *auth_out) {
        counted_t<val_t> auth = optarg(env, "auth");
        if (auth.has()) {
            counted_t<const datum_t> datum_auth = auth->as_datum();
            if (datum_auth->get_type() != datum_t::R_OBJECT) {
                rfail_target(this, base_exc_t::GENERIC,
                             "Expected `auth` to be an OBJECT, but found %s.",
                             datum_auth->get_type_name().c_str());
            }

            std::string user, pass, type;
            get_auth_item(datum_auth, "type", &type);
            get_auth_item(datum_auth, "user", &user);
            get_auth_item(datum_auth, "pass", &pass);

            if (type == "none") {
                // Do nothing - this is the default
            } else if (type == "basic") {
                auth_out->make_basic_auth(std::move(user), std::move(pass));
            } else if (type == "digest") {
                auth_out->make_digest_auth(std::move(user), std::move(pass));
            } else {
                rfail_target(this, base_exc_t::GENERIC,
                             "`auth.type` is not recognized ('none', 'basic', and 'digest' are allowed).");
            }
        }
    }

    void get_body(scope_env_t *env, std::string *body_out) {
        counted_t<val_t> body = optarg(env, "body");
        if (body.has()) {
            counted_t<const datum_t> datum_body = body->as_datum();
            if (datum_body->get_type() == datum_t::R_STR) {
                body_out->assign(datum_body->as_str().to_std());
            } else if (datum_body->get_type() == datum_t::R_OBJECT ||
                       datum_body->get_type() == datum_t::R_ARRAY) {
                body_out->assign(datum_body->print());
            } else {
                rfail_target(this, base_exc_t::GENERIC,
                             "Expected `body` to be a STRING, OBJECT or ARRAY, but found %s.",
                             datum_body->get_type_name().c_str());
            }
        }
    }

    std::string escape_param_str(const std::string &param) {
        std::string result;
        for (size_t i = 0; i < param.length(); ++i) {
            char c = param[i];
            if ((c >= 'A' && c <= 'Z') ||
                (c >= 'a' && c <= 'z') ||
                (c >= '0' && c <= '9')) {
                result += c;
            } else {
                result += strprintf("%%%.2hhX\n", c);
            }
        }
        return result;
    }

    void get_params(scope_env_t *env, std::string *params_out) {
        counted_t<val_t> params = optarg(env, "params");
        if (params.has()) {
            counted_t<const datum_t> datum_params = params->as_datum();
            if (datum_params->get_type() == datum_t::R_STR) {
                params_out->assign(datum_params->as_str().to_std());
            } else if (datum_params->get_type() == datum_t::R_OBJECT) {
                const std::map<std::string, counted_t<const datum_t> > &params_map = datum_params->as_object();
                for (auto it = params_map.begin(); it != params_map.end(); ++it) {
                    params_out += params_out->empty() ? '?' : '&';
                    if (it->second->get_type() == datum_t::R_NUM) {
                        params_out->append(strprintf("%s=%" PR_RECONSTRUCTABLE_DOUBLE,
                                                     escape_param_str(it->first).c_str(),
                                                     it->second->as_num()));
                    } else if (it->second->get_type() == datum_t::R_STR) {
                        params_out->append(strprintf("%s=%s",
                                                     escape_param_str(it->first).c_str(),
                                                     escape_param_str(it->second->as_str().to_std()).c_str()));
                    } else if (it->second->get_type() == datum_t::R_NULL) {
                        params_out->append(strprintf("%s=",
                                                     escape_param_str(it->first).c_str()));
                    } else {
                        rfail_target(this, base_exc_t::GENERIC,
                                     "Expected `params.%s` to be a NUMBER, STRING or NULL, but found %s.",
                                     it->first.c_str(), it->second->get_type_name().c_str());
                    }
                }
                
            } else {
                rfail_target(this, base_exc_t::GENERIC,
                             "Expected `params` to be a STRING or OBJECT, but found %s.",
                             datum_params->get_type_name().c_str());
            }
        }
    }

    void get_result_format(scope_env_t *env, http_result_format_t *result_format_out) {
        counted_t<val_t> result_format = optarg(env, "result_format");
        if (result_format.has()) {
            counted_t<const datum_t> datum_result_format = result_format->as_datum();
            if (datum_result_format->get_type() != datum_t::R_STR) {
                rfail_target(this, base_exc_t::GENERIC,
                             "Expected `result_format` to be a STRING, but found %s.",
                             datum_result_format->get_type_name().c_str());
            }

            std::string result_format_str = datum_result_format->as_str().to_std();
            if (result_format_str == "auto") {
                *result_format_out = http_result_format_t::AUTO;
            } else if (result_format_str == "json") {
                *result_format_out = http_result_format_t::JSON;
            } else if (result_format_str == "text") {
                *result_format_out = http_result_format_t::TEXT;
            } else {
                rfail_target(this, base_exc_t::GENERIC,
                             "`result_format` (%s) is not recognized, ('auto', 'json', and 'text' are allowed).",
                             result_format_str.c_str());
            }
        }
    }

    void get_attempts(scope_env_t *env, uint64_t *attempts_out) {
        counted_t<val_t> attempts = optarg(env, "method");
        if (attempts.has()) {
            counted_t<const datum_t> datum_attempts = attempts->as_datum();
            if (datum_attempts->get_type() != datum_t::R_STR) {
                rfail_target(this, base_exc_t::GENERIC,
                             "Expected `attempts` to be a NUMBER, but found %s.",
                             datum_attempts->get_type_name().c_str());
            }

            int64_t temp = datum_attempts->as_int();
            if (temp < 0) {
                rfail_target(this, base_exc_t::GENERIC,
                             "`attempts` (%" PRIi64 ") cannot be negative.", temp);
            }
            *attempts_out = temp;
        }
    }

    void get_bool_optarg(const std::string &optarg_name, scope_env_t *env, bool *bool_out) {
        counted_t<val_t> option = optarg(env, optarg_name);
        if (option.has()) {
            counted_t<const datum_t> datum_option = option->as_datum();
            if (datum_option->get_type() != datum_t::R_STR) {
                rfail_target(this, base_exc_t::GENERIC,
                             "Expected `%s` to be a NUMBER, but found %s.",
                             optarg_name.c_str(), datum_option->get_type_name().c_str());
            }
            *bool_out = datum_option->as_bool();
        }
    }

    void get_optargs(scope_env_t *env, http_opts_t *opts_out) {
        get_auth(env, &opts_out->auth);
        get_method(env, &opts_out->method);
        get_result_format(env, &opts_out->result_format);
        get_params(env, &opts_out->url_params);
        get_header(env, &opts_out->header);
        get_body(env, &opts_out->body);
        get_timeout(env, &opts_out->timeout_ms);
        get_attempts(env, &opts_out->attempts);
        get_bool_optarg("allow_redirect", env, &opts_out->allow_redirect);
        get_bool_optarg("depaginate", env, &opts_out->depaginate);
        get_bool_optarg("verify", env, &opts_out->verify);
    }

    virtual counted_t<val_t> eval_impl(scope_env_t *env, UNUSED eval_flags_t flags) {
        scoped_ptr_t<http_opts_t> opts(new http_opts_t());
        opts->url.assign(arg(env, 0)->as_str().to_std());
        get_optargs(env, opts.get());

        http_result_t http_result;
        try {
            http_runner_t runner(env->env->extproc_pool);
            http_result = runner.http(opts.get(), env->env->interruptor);
        } catch (const http_worker_exc_t &e) {
            http_result = strprintf("HTTP %s of `%s` caused a crash in a worker process.",
                                    http_method_to_str(opts->method).c_str(), opts->url.c_str());
        } catch (const interrupted_exc_t &e) {
            http_result = strprintf("HTTP %s of `%s` timed out after %" PRIu64 ".%03" PRIu64 " seconds.",
                                    http_method_to_str(opts->method).c_str(), opts->url.c_str(),
                                    opts->timeout_ms / 1000, opts->timeout_ms % 1000);
        } catch (const std::exception &e) {
            http_result = std::string(e.what());
        } catch (...) {
            http_result = std::string("HTTP encountered an unknown exception");
        }

        return boost::apply_visitor(http_result_visitor_t(this), http_result);
    }

    virtual const char *name() const { return "javascript"; }

    // No JS term is considered deterministic
    virtual bool is_deterministic() const {
        return false;
    }
};

counted_t<term_t> make_http_term(compile_env_t *env, const protob_t<const Term> &term) {
    return make_counted<http_term_t>(env, term);
}

}  // namespace ql
