// Copyright 2010-2013 RethinkDB, all rights reserved.
#ifndef EXTPROC_HTTP_JOB_HPP_
#define EXTPROC_HTTP_JOB_HPP_

#include <vector>
#include <string>

#include "errors.hpp"
#include <boost/make_shared.hpp>

#include "utils.hpp"
#include "containers/archive/archive.hpp"
#include "containers/counted.hpp"
#include "concurrency/signal.hpp"
#include "extproc/extproc_pool.hpp"
#include "extproc/extproc_job.hpp"
#include "extproc/http_runner.hpp"
#include "rdb_protocol/datum.hpp"

class http_job_t {
public:
    http_job_t(extproc_pool_t *pool, signal_t *interruptor);

    http_result_t http(const http_opts_t *opts);

    // Marks the extproc worker as errored to simplify cleanup later
    void worker_error();

private:
    static bool worker_fn(read_stream_t *stream_in, write_stream_t *stream_out);

    extproc_job_t extproc_job;
    DISABLE_COPYING(http_job_t);
};

#endif /* EXTPROC_HTTP_JOB_HPP_ */
