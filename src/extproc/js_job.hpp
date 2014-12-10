// Copyright 2010-2013 RethinkDB, all rights reserved.
#ifndef EXTPROC_JS_JOB_HPP_
#define EXTPROC_JS_JOB_HPP_

#include <vector>
#include <string>

// RSI
//#if defined(__GNUC__) && (100 * __GNUC__ + __GNUC_MINOR__ >= 406)
//#pragma GCC diagnostic push
//#pragma GCC diagnostic ignored "-Wunused-parameter"
//#endif
#include <v8.h>
//#if defined(__GNUC__) && (100 * __GNUC__ + __GNUC_MINOR__ >= 406)
//#pragma GCC diagnostic pop
//#endif

#include "errors.hpp"
#include <boost/make_shared.hpp>

#include "utils.hpp"
#include "containers/archive/archive.hpp"
#include "containers/counted.hpp"
#include "concurrency/signal.hpp"
#include "extproc/extproc_pool.hpp"
#include "extproc/extproc_job.hpp"
#include "extproc/js_runner.hpp"
#include "rdb_protocol/datum.hpp"

class js_job_t {
public:
    js_job_t(extproc_pool_t *pool, signal_t *interruptor,
             const ql::configured_limits_t &limits);

    js_result_t eval(const std::string &source);
    js_result_t call(js_id_t id, const std::vector<ql::datum_t> &args);
    void release(js_id_t id);
    void exit();

    // Marks the extproc worker as errored to simplify cleanup later
    void worker_error();

private:
    static bool worker_fn(read_stream_t *stream_in, write_stream_t *stream_out);

    extproc_job_t extproc_job;
    ql::configured_limits_t limits;
    DISABLE_COPYING(js_job_t);
};

#endif /* EXTPROC_JS_JOB_HPP_ */
