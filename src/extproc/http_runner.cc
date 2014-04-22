// Copyright 2010-2014 RethinkDB, all rights reserved.
#include "extproc/http_runner.hpp"

#include "extproc/http_job.hpp"
#include "time.hpp"

http_runner_t::http_runner_t(extproc_pool_t *_pool) :
    pool(_pool) { }

http_result_t http_runner_t::http(const std::string &url,
                                  const std::vector<std::string> &headers,
                                  size_t rate_limit,
                                  uint64_t timeout_ms,
                                  signal_t *interruptor) {
    signal_timer_t timeout;
    wait_any_t combined_interruptor(interruptor, &timeout);
    http_job_t job(pool, &combined_interruptor);

    assert_thread();
    timeout.start(timeout_ms);

    try {
        return job.http(url, headers, rate_limit);
    } catch (...) {
        // This will mark the worker as errored so we don't try to re-sync with it
        //  on the next line (since we're in a catch statement, we aren't allowed)
        job.worker_error();
        throw;
    }
}

