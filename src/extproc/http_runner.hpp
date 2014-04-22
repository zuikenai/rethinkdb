// Copyright 2010-2014 RethinkDB, all rights reserved.
#ifndef EXTPROC_HTTP_RUNNER_HPP_
#define EXTPROC_HTTP_RUNNER_HPP_

#include <string>
#include <vector>
#include <set>

#include "errors.hpp"
#include <boost/make_shared.hpp>
#include <boost/variant.hpp>

#include "containers/scoped.hpp"
#include "containers/counted.hpp"
#include "rdb_protocol/datum.hpp"
#include "concurrency/wait_any.hpp"
#include "arch/timing.hpp"
#include "http/json.hpp"

// http calls result either in a DATUM return value, a function id (which we can
// use to call the function later), or an error string
typedef boost::variant<counted_t<const ql::datum_t>, std::string> http_result_t;

class extproc_pool_t;
class http_runner_t;
class httpjs_job_t;

class http_worker_exc_t : public std::exception {
public:
    explicit http_worker_exc_t(const std::string& data) : info(data) { }
    ~http_worker_exc_t() throw () { }
    const char *what() const throw () { return info.c_str(); }
private:
    std::string info;
};

// A handle to a running "javascript evaluator" job.
class http_runner_t : public home_thread_mixin_t {
public:
    http_runner_t(extproc_pool_t *_pool);

    http_result_t http(const std::string &url,
                       const std::vector<std::string> &headers,
                       size_t rate_limit,
                       uint64_t timeout_ms,
                       signal_t *interruptor);

private:
    extproc_pool_t *pool;

    DISABLE_COPYING(http_runner_t);
};

#endif /* EXTPROC_HTTP_RUNNER_HPP_ */
