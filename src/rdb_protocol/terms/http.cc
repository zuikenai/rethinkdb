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
                  optargspec_t({"data",
                                "timeout",
                                "method",
                                "params",
                                "header",
                                "attempts",
                                "redirects",
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
            if (datum_timeout->get_type() != datum_t::R_NUM) {
                rfail_target(timeout.get(), base_exc_t::GENERIC,
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

    // Don't allow header strings to include newlines
    void verify_header_string(const std::string &str, pb_rcheckable_t *header) {
        if (str.find_first_of("\r\n") != std::string::npos) {
            rfail_target(header, base_exc_t::GENERIC,
                         "A `header` item contains newline characters.");
        }
    }

    void get_header(scope_env_t *env, std::vector<std::string> *header_out) {
        counted_t<val_t> header = optarg(env, "header");
        if (header.has()) {
            counted_t<const datum_t> datum_header = header->as_datum();
            if (datum_header->get_type() == datum_t::R_OBJECT) {
                const std::map<std::string, counted_t<const datum_t> > &header_map = datum_header->as_object();
                for (auto it = header_map.begin(); it != header_map.end(); ++it) {
                    std::string str;
                    // If the value for the header is supposed to be empty, libcurl requires
                    // a semicolon instead of a colon
                    if (it->second->get_type() == datum_t::R_STR) {
                        if (it->second->as_str().size() == 0) {
                            str = strprintf("%s;", it->first.c_str());
                        } else {
                            str = strprintf("%s: %s", it->first.c_str(),
                                            it->second->as_str().c_str());
                        }
                    } else if (it->second->get_type() == datum_t::R_NULL) {
                        // TODO: it looks like libcurl omits these...
                        str = strprintf("%s;", it->first.c_str());
                    } else {
                        rfail_target(header.get(), base_exc_t::GENERIC,
                                     "Expected `header.%s` to be a STRING or NULL, but found %s.",
                                     it->first.c_str(), it->second->get_type_name().c_str());
                    }
                    verify_header_string(str, header.get());
                    header_out->push_back(str);
                }
            } else if (datum_header->get_type() == datum_t::R_ARRAY) {
                for (size_t i = 0; i < datum_header->size(); ++i) {
                    counted_t<const datum_t> line = datum_header->get(i);
                    if (line->get_type() != datum_t::R_STR) {
                        rfail_target(header.get(), base_exc_t::GENERIC,
                                     "Expected `header[%zu]` to be a STRING, but found %s.",
                                     i, line->get_type_name().c_str());
                    }
                    std::string str = line->as_str().to_std();
                    verify_header_string(str, header.get());
                    header_out->push_back(str);
                }
            } else {
                rfail_target(header.get(), base_exc_t::GENERIC,
                             "Expected `header` to be an ARRAY or OBJECT, but found %s.",
                             datum_header->get_type_name().c_str());
            }
        }
    }

    void get_method(scope_env_t *env, http_method_t *method_out) {
        counted_t<val_t> method = optarg(env, "method");
        if (method.has()) {
            counted_t<const datum_t> datum_method = method->as_datum();
            if (datum_method->get_type() != datum_t::R_STR) {
                rfail_target(method.get(), base_exc_t::GENERIC,
                             "Expected `method` to be a STRING, but found %s.",
                             datum_method->get_type_name().c_str());
            }

            std::string method_str = datum_method->as_str().to_std();
            if (method_str == "GET") {
                *method_out = http_method_t::GET;
            } else if (method_str == "HEAD") {
                *method_out = http_method_t::HEAD;
            } else if (method_str == "POST") {
                *method_out = http_method_t::POST;
            } else if (method_str == "PUT") {
                *method_out = http_method_t::PUT;
            } else if (method_str == "PATCH") {
                *method_out = http_method_t::PATCH;
            } else if (method_str == "DELETE") {
                *method_out = http_method_t::DELETE;
            } else {
                rfail_target(method.get(), base_exc_t::GENERIC,
                             "`method` (%s) is not recognized (GET, HEAD, POST, PUT, PATCH and DELETE are allowed).",
                             method_str.c_str());
            }
        }
    }

    void get_auth_item(const counted_t<const datum_t> &datum,
                       const std::string &name,
                       std::string *str_out,
                       pb_rcheckable_t *auth) {
        counted_t<const datum_t> item = datum->get(name, NOTHROW);
        if (!item.has()) {
            rfail_target(auth, base_exc_t::GENERIC,
                         "`auth.%s` not found in the auth object.", name.c_str());
        } else if (item->get_type() != datum_t::R_STR) {
            rfail_target(auth, base_exc_t::GENERIC,
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
                rfail_target(auth.get(), base_exc_t::GENERIC,
                             "Expected `auth` to be an OBJECT, but found %s.",
                             datum_auth->get_type_name().c_str());
            }

            std::string user, pass, type;
            get_auth_item(datum_auth, "type", &type, auth.get());
            get_auth_item(datum_auth, "user", &user, auth.get());
            get_auth_item(datum_auth, "pass", &pass, auth.get());

            if (type == "none") {
                // Do nothing - this is the default
            } else if (type == "basic") {
                auth_out->make_basic_auth(std::move(user), std::move(pass));
            } else if (type == "digest") {
                auth_out->make_digest_auth(std::move(user), std::move(pass));
            } else {
                rfail_target(auth.get(), base_exc_t::GENERIC,
                             "`auth.type` is not recognized ('none', 'basic', and 'digest' are allowed).");
            }
        }
    }

    std::string print_http_param(const counted_t<const datum_t> &datum,
                                 const char *val_name,
                                 const char *key_name,
                                 pb_rcheckable_t *val) {
        if (datum->get_type() == datum_t::R_NUM) {
            return strprintf("%" PR_RECONSTRUCTABLE_DOUBLE,
                             datum->as_num());
        } else if (datum->get_type() == datum_t::R_STR) {
            return datum->as_str().to_std();
        } else if (datum->get_type() == datum_t::R_NULL) {
            return std::string();
        }

        rfail_target(val, base_exc_t::GENERIC,
                     "Expected `%s.%s` to be a NUMBER, STRING or NULL, but found %s.",
                     val_name, key_name, datum->get_type_name().c_str());
    }

    void get_data(scope_env_t *env,
                  std::string *data_out,
                  std::vector<std::pair<std::string, std::string> > *form_data_out,
                  http_method_t method) {
        counted_t<val_t> data = optarg(env, "data");
        if (data.has()) {
            counted_t<const datum_t> datum_data = data->as_datum();
            if (method == http_method_t::PUT ||
                method == http_method_t::PATCH) {
                // TODO: make sure this is actually expected behavior for all types
                //  e.g. strings, arrays, objects, numbers
                data_out->assign(datum_data->print());
            } else if (method == http_method_t::POST) {
                if (datum_data->get_type() == datum_t::R_STR) {
                    // Use the put data for this, as we assume the user does any
                    // encoding they need when they pass a string
                    data_out->assign(datum_data->as_str().to_std());
                } else if (datum_data->get_type() == datum_t::R_OBJECT) {
                    const std::map<std::string, counted_t<const datum_t> > &form_map = datum_data->as_object();
                    for (auto it = form_map.begin(); it != form_map.end(); ++it) {
                        std::string val_str = print_http_param(it->second, "data",
                                                               it->first.c_str(), data.get());
                        form_data_out->push_back(std::make_pair(it->first, val_str));
                    }
                } else {
                    rfail_target(data.get(), base_exc_t::GENERIC,
                                 "Expected `data` to be a STRING or OBJECT, but found %s.",
                                 datum_data->get_type_name().c_str());
                }
            } else {
                rfail_target(this, base_exc_t::GENERIC,
                             "`data` should only be specified on a PUT, POST, or PATCH request.");
            }
        }
    }

    void get_params(scope_env_t *env, std::vector<std::pair<std::string, std::string> > *params_out) {
        counted_t<val_t> params = optarg(env, "params");
        if (params.has()) {
            counted_t<const datum_t> datum_params = params->as_datum();
            if (datum_params->get_type() == datum_t::R_OBJECT) {
                const std::map<std::string, counted_t<const datum_t> > &params_map = datum_params->as_object();
                for (auto it = params_map.begin(); it != params_map.end(); ++it) {
                    std::string val_str = print_http_param(it->second, "params",
                                                           it->first.c_str(), params.get());
                    params_out->push_back(std::make_pair(it->first, val_str));
                }
                
            } else {
                rfail_target(params.get(), base_exc_t::GENERIC,
                             "Expected `params` to be an OBJECT, but found %s.",
                             datum_params->get_type_name().c_str());
            }
        }
    }

    void get_result_format(scope_env_t *env, http_result_format_t *result_format_out) {
        counted_t<val_t> result_format = optarg(env, "result_format");
        if (result_format.has()) {
            counted_t<const datum_t> datum_result_format = result_format->as_datum();
            if (datum_result_format->get_type() != datum_t::R_STR) {
                rfail_target(result_format.get(), base_exc_t::GENERIC,
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
                rfail_target(result_format.get(), base_exc_t::GENERIC,
                             "`result_format` (%s) is not recognized, ('auto', 'json', and 'text' are allowed).",
                             result_format_str.c_str());
            }
        }
    }

    void get_attempts(scope_env_t *env, uint64_t *attempts_out) {
        counted_t<val_t> attempts = optarg(env, "attempts");
        if (attempts.has()) {
            counted_t<const datum_t> datum_attempts = attempts->as_datum();
            if (datum_attempts->get_type() != datum_t::R_NUM) {
                rfail_target(attempts.get(), base_exc_t::GENERIC,
                             "Expected `attempts` to be a NUMBER, but found %s.",
                             datum_attempts->get_type_name().c_str());
            }

            int64_t temp = datum_attempts->as_int();
            if (temp < 0) {
                rfail_target(attempts.get(), base_exc_t::GENERIC,
                             "`attempts` (%" PRIi64 ") cannot be negative.", temp);
            }
            *attempts_out = temp;
        }
    }

    void get_redirects(scope_env_t *env, uint32_t *redirects_out) {
        counted_t<val_t> redirects = optarg(env, "redirects");
        if (redirects.has()) {
            counted_t<const datum_t> datum_redirects = redirects->as_datum();
            if (datum_redirects->get_type() != datum_t::R_NUM) {
                rfail_target(redirects.get(), base_exc_t::GENERIC,
                             "Expected `redirects` to be a NUMBER, but found %s.",
                             datum_redirects->get_type_name().c_str());
            }

            int64_t temp = datum_redirects->as_int();
            if (temp < 0) {
                rfail_target(redirects.get(), base_exc_t::GENERIC,
                             "`redirects` (%" PRIi64 ") cannot be negative.", temp);
            } else if (temp > std::numeric_limits<uint32_t>::max()) {
                rfail_target(redirects.get(), base_exc_t::GENERIC,
                             "`redirects` (%" PRIi64 ") cannot be greater than 2^32 - 1.", temp);
            }

            *redirects_out = temp;
        }
    }

    void get_bool_optarg(const std::string &optarg_name, scope_env_t *env, bool *bool_out) {
        counted_t<val_t> option = optarg(env, optarg_name);
        if (option.has()) {
            counted_t<const datum_t> datum_option = option->as_datum();
            if (datum_option->get_type() != datum_t::R_BOOL) {
                rfail_target(option.get(), base_exc_t::GENERIC,
                             "Expected `%s` to be a BOOL, but found %s.",
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
        get_data(env, &opts_out->data, &opts_out->form_data, opts_out->method);
        get_timeout(env, &opts_out->timeout_ms);
        get_attempts(env, &opts_out->attempts);
        get_redirects(env, &opts_out->max_redirects);
        // TODO: make depaginate a function, also a string to select a predefined style
        get_bool_optarg("depaginate", env, &opts_out->depaginate);
        get_bool_optarg("verify", env, &opts_out->verify);
    }

    virtual counted_t<val_t> eval_impl(scope_env_t *env, UNUSED eval_flags_t flags) {
        scoped_ptr_t<http_opts_t> opts(new http_opts_t());
        opts->url.assign(arg(env, 0)->as_str().to_std());
        opts->proxy.assign(env->env->reql_http_proxy);
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
