// Copyright 2010-2014 RethinkDB, all rights reserved.
#include "extproc/http_job.hpp"

#include <stdint.h>
#include <cmath>
#include <limits>

#include <curl/curl.h>

#include "debug.hpp"

#include "containers/archive/boost_types.hpp"
#include "containers/archive/stl_types.hpp"
#include "extproc/extproc_job.hpp"
#include "rdb_protocol/rdb_protocol_json.hpp"
#include "rdb_protocol/pseudo_time.hpp"

// Returns an empty counted_t on error.
counted_t<const ql::datum_t> http_to_datum(const std::string &json);
http_result_t perform_http(http_opts_t *opts);

class curl_exc_t : public std::exception {
public:
    curl_exc_t(const std::string &info, const std::string &err_msg) :
        error_string(strprintf("%s '%s'", info.c_str(), err_msg.c_str())) { }
    ~curl_exc_t() throw () { }
    const char *what() const throw () {
        return error_string.c_str();
    }
    const std::string error_string;
};

class curl_callbacks_t {
public:
    curl_callbacks_t(std::string &&body_str) : body(std::move(body_str)) { }

    static size_t write(char *ptr, size_t size, size_t nmemb, void* instance) {
        curl_callbacks_t *self = reinterpret_cast<curl_callbacks_t*>(instance);
        uint64_t bytes_to_copy = size;
        bytes_to_copy *= nmemb;
        return self->write_internal(ptr, bytes_to_copy);
    };

    static size_t read(char *ptr, size_t size, size_t nmemb, void* instance) {
        curl_callbacks_t *self = reinterpret_cast<curl_callbacks_t*>(instance);
        uint64_t bytes_to_copy = size;
        bytes_to_copy *= nmemb;
        return self->read_internal(ptr, bytes_to_copy);
    };

    std::string &get_data() {
        return data;
    }

    const std::string &get_body() const {
        return body;
    }

private:
    // This is called for getting data in the response from the server
    size_t write_internal(char *ptr, const uint64_t size) {
        printf("got write with size: %" PRIu64 "\n", size);
        // A little paranoid, maybe, but handle situations where we receive >4 GB on a 32-bit arch
        size_t size_left = size;
        while (size_left > 0) {
            size_t bytes_to_copy = std::min<uint64_t>(size_left, std::numeric_limits<size_t>::max());
            data.append(ptr, bytes_to_copy);
            size_left -= bytes_to_copy;
        }
        // TODO: streaming stuff
        return size;
    }

    // This is called for writing data to the request when sending
    size_t read_internal(char *ptr, uint64_t size) {
        printf("got read with size: %" PRIu64, size);
        size_t bytes_to_copy = std::min<uint64_t>( { size,
                                                     body.size() - body_offset,
                                                     std::numeric_limits<size_t>::max() } );
        memcpy(ptr, body.data() + body_offset, bytes_to_copy);
        return bytes_to_copy;
    }

    std::string data;

    uint64_t body_offset;
    std::string body;
};

// The job_t runs in the context of the main rethinkdb process
http_job_t::http_job_t(extproc_pool_t *pool, signal_t *interruptor) :
    extproc_job(pool, &worker_fn, interruptor) { }

http_result_t http_job_t::http(const http_opts_t *opts) {
    write_message_t msg;
    msg << *opts;
    {
        int res = send_write_message(extproc_job.write_stream(), &msg);
        if (res != 0) { throw http_worker_exc_t("failed to send data to the worker"); }
    }

    http_result_t result;
    archive_result_t res = deserialize(extproc_job.read_stream(), &result);
    if (bad(res)) {
        throw http_worker_exc_t(strprintf("failed to deserialize result from worker (%s)",
                                          archive_result_as_str(res)));
    }
    return result;
}

void http_job_t::worker_error() {
    extproc_job.worker_error();
}

bool http_job_t::worker_fn(read_stream_t *stream_in, write_stream_t *stream_out) {
    http_opts_t opts;
    {
        archive_result_t res = deserialize(stream_in, &opts);
        if (bad(res)) { return false; }
    }

    http_result_t result;

    try {
        result = perform_http(&opts);
    } catch (const std::exception &ex) {
        result = std::string(ex.what());
    } catch (...) {
        result = std::string("Unknown error when performing http");
    }

    write_message_t msg;
    msg << result;
    int res = send_write_message(stream_out, &msg);
    if (res != 0) { return false; }

    return true;
}

template <class T>
void exc_setopt(CURL *curl_handle, CURLoption opt, T val, const char *info) {
    CURLcode curl_res = curl_easy_setopt(curl_handle, opt, val);
    if (curl_res != CURLE_OK) {
        throw curl_exc_t(std::string("setopt ") + info, curl_easy_strerror(curl_res));
    }
}

void transfer_auth_opt(const http_opts_t::http_auth_t &auth, CURL *curl_handle) {
    // TODO: support an array of auth objects to use - rather than just one
    if (auth.type != http_auth_type_t::NONE) {
        long curl_auth_type;
        switch (auth.type) {
        case http_auth_type_t::BASIC:
            curl_auth_type = CURLAUTH_BASIC;
            break;
        case http_auth_type_t::DIGEST:
            curl_auth_type = CURLAUTH_DIGEST;
            break;
        case http_auth_type_t::NONE:
        default:
            unreachable();
        }
        exc_setopt(curl_handle, CURLOPT_HTTPAUTH, curl_auth_type, "HTTP AUTH TYPE");
        exc_setopt(curl_handle, CURLOPT_USERNAME, auth.username.c_str(), "HTTP AUTH USERNAME");
        exc_setopt(curl_handle, CURLOPT_PASSWORD, auth.password.c_str(), "HTTP AUTH PASSWORD");
    }
}

void transfer_method_opt(http_method_t method, CURL *curl_handle) {
    switch (method) {
        case http_method_t::GET:
            exc_setopt(curl_handle, CURLOPT_HTTPGET, 1, "HTTP GET");
            break;
        case http_method_t::PUT:
            exc_setopt(curl_handle, CURLOPT_UPLOAD, 1, "HTTP PUT");
            break;
        case http_method_t::POST:
            exc_setopt(curl_handle, CURLOPT_POST, 1, "HTTP POST");
            break;
        case http_method_t::HEAD:
            // TODO: error if a body is set - won't be sent by libcurl?
            exc_setopt(curl_handle, CURLOPT_NOBODY, 1, "HTTP HEAD");
            break;
        case http_method_t::DELETE:
            exc_setopt(curl_handle, CURLOPT_CUSTOMREQUEST, "DELETE", "HTTP DELETE");
            break;
        default:
            unreachable();
    }
}

void transfer_url_opt(const std::string &url,
                      const std::vector<std::pair<std::string, std::string> > &url_params,
                      CURL *curl_handle) {
    // TODO: what happens when verify is true, but protocol is http, or vice-versa
    std::string full_url = url;
    for (auto it = url_params.begin(); it != url_params.end(); ++it) {
        char *key = it->first.length() == 0 ? NULL :
            curl_easy_escape(curl_handle, it->first.data(), it->first.length());
        char *val = it->second.length() == 0 ? NULL :
            curl_easy_escape(curl_handle, it->second.data(), it->second.length());
        full_url += strprintf("%s%s=%s",
                              it == url_params.begin() ? "?" : "&",
                              key == NULL ? "": key,
                              val == NULL ? "": val);
        curl_free(key);
        curl_free(val);
    }

    exc_setopt(curl_handle, CURLOPT_URL, full_url.c_str(), "URL");
}

// TODO: verify that header items do not contain newlines
void transfer_header_opt(const std::vector<std::string> &header, CURL *curl_handle) {
    struct curl_slist *curl_header = NULL;

    for (auto it = header.begin(); it != header.end(); ++it) {
        curl_header = curl_slist_append(curl_header, it->c_str());
        if (curl_header == NULL) {
            throw curl_exc_t("appending headers", "allocation failure");
        }
    }

    if (curl_header != NULL) {
        exc_setopt(curl_handle, CURLOPT_HTTPHEADER, curl_header, "HEADER");
        curl_slist_free_all(curl_header);
    }
}

// TODO: make allow_redirect a number corresponding to how many redirects to allow
void transfer_redirect_opt(bool allow_redirect, CURL *curl_handle) {
    long val = allow_redirect ? 1 : 0;
    exc_setopt(curl_handle, CURLOPT_FOLLOWLOCATION, val, "ALLOW REDIRECT");
    // TODO: what to do about CURLOPT_POSTREDIR?
}

void transfer_verify_opt(bool verify, CURL *curl_handle) {
    long val = verify ? 1 : 0;
    exc_setopt(curl_handle, CURLOPT_SSL_VERIFYPEER, val, "SSL VERIFY PEER");
    val = verify ? 2 : 0;
    exc_setopt(curl_handle, CURLOPT_SSL_VERIFYHOST, val, "SSL VERIFY HOST");
}

void transfer_opts(const http_opts_t &opts,
                   CURL *curl_handle) {
    transfer_auth_opt(opts.auth, curl_handle);
    transfer_url_opt(opts.url, opts.url_params, curl_handle);
    transfer_redirect_opt(opts.allow_redirect, curl_handle);
    transfer_verify_opt(opts.verify, curl_handle);

    transfer_header_opt(opts.header, curl_handle);

    // Set method last as it may override some options libcurl automatically sets
    transfer_method_opt(opts.method, curl_handle);
}

// TODO: should we set any default socket options with CURLOPT_SOCKOPTFUNCTION ?
// TODO: get proxy info from command-line
void set_default_opts(CURL *curl_handle,
                      const std::string &proxy,
                      const curl_callbacks_t &callbacks) {
    exc_setopt(curl_handle, CURLOPT_WRITEFUNCTION, &curl_callbacks_t::write, "WRITE FUNCTION");
    exc_setopt(curl_handle, CURLOPT_WRITEDATA, &callbacks, "WRITE DATA");

    // Only allow http protocol
    exc_setopt(curl_handle, CURLOPT_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS, "PROTOCOLS");

    // Use the proxy set when launched
    if (!proxy.empty()) {
        exc_setopt(curl_handle, CURLOPT_PROXY, proxy.c_str(), "PROXY");
    }

    if (!callbacks.get_body().empty()) {
        exc_setopt(curl_handle, CURLOPT_READFUNCTION, &curl_callbacks_t::read, "READ FUNCTION");
        exc_setopt(curl_handle, CURLOPT_READDATA, &callbacks, "READ DATA");
    }
    // TODO: set BUFFERSIZE for more resolution when streaming results?
}

// TODO: better errors
// TODO: implement depaginate
// TODO: implement streams
http_result_t perform_http(http_opts_t *opts) {
    curl_callbacks_t callbacks(std::move(opts->body));

    printf("curl_easy_init\n");
    CURL* curl_handle = curl_easy_init();
    if (curl_handle == NULL) {
        return std::string("failed to initialize curl handle");
    }

    try {
        printf("set_default_opts\n");
        set_default_opts(curl_handle, opts->proxy, callbacks);
        printf("transfer_opts\n");
        transfer_opts(*opts, curl_handle);
    } catch (curl_exc_t &ex) {
        return strprintf("failed to set options: %s", ex.what());
    }

    CURLcode curl_res = CURLE_OK;
    long response_code;
    do {
        printf("curl_easy_perform\n");
        CURLcode curl_res = curl_easy_perform(curl_handle);
        if (curl_res != CURLE_OK) {
            return strprintf("curl failed: %s", curl_easy_strerror(curl_res));
        }
        // Break on success, retry on temporary error
        curl_res = curl_easy_getinfo(curl_handle, CURLINFO_RESPONSE_CODE, &response_code);
        if (curl_res == CURLE_SEND_ERROR ||
            curl_res == CURLE_RECV_ERROR ||
            curl_res == CURLE_COULDNT_CONNECT) {
            continue;
        } else if (curl_res != CURLE_OK) {
            break;
        }

        // Error codes that may be resolved by retrying the request
        if (response_code != 408 &&
            response_code != 500 &&
            response_code != 502 &&
            response_code != 503 &&
            response_code != 504) {
            break;
        }
        --opts->attempts;
    } while (opts->attempts > 0);

    if (curl_res != CURLE_OK) {
        return strprintf("could not get response code: %s", curl_easy_strerror(curl_res));
    } else if (response_code < 200 || response_code >= 300) {
        // TODO: include response data
        return strprintf("HTTP status code %ld", response_code);
    }

    printf("parse http response\n");
    counted_t<const ql::datum_t> res;
    switch (opts->result_format) {
    case http_result_format_t::AUTO:
        {
            char *content_type_buffer;
            curl_easy_getinfo(curl_handle, CURLINFO_CONTENT_TYPE, &content_type_buffer);

            std::string content_type(content_type_buffer);
            if (content_type == "application/json") {
                return http_to_datum(callbacks.get_data());
            } else {
                return make_counted<const ql::datum_t>(std::move(callbacks.get_data()));
            }
        }
    case http_result_format_t::JSON:
        return http_to_datum(callbacks.get_data());
    case http_result_format_t::TEXT:
        return make_counted<const ql::datum_t>(std::move(callbacks.get_data()));
    default:
        unreachable();
    }

    return http_to_datum(callbacks.get_data());
}

counted_t<const ql::datum_t> http_to_datum(const std::string &json) {
    scoped_cJSON_t cjson(cJSON_Parse(json.c_str()));
    if (cjson.get() == NULL) {
        return counted_t<const ql::datum_t>();
    }

    return make_counted<const ql::datum_t>(cjson);
}

