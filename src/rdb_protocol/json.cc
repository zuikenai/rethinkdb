#include <string.h>

#include "rdb_protocol/json.hpp"
#include "rdb_protocol/exceptions.hpp"

namespace query_language {

int cJSON_cmp(cJSON *l, cJSON *r, const backtrace_t &backtrace) {
    if (l->type != r->type) {
        return l->type - r->type;
    }
    switch (l->type) {
        case cJSON_False:
            if (r->type == cJSON_True) {
                return -1;
            } else if (r->type == cJSON_False) {
                return 0;
            } else {
                throw runtime_exc_t("Booleans can only be compared to other booleans", backtrace);
            }
            break;
        case cJSON_True:
            if (r->type == cJSON_True) {
                return 0;
            } else if (r->type == cJSON_False) {
                return 1;
            } else {
                throw runtime_exc_t("Booleans can only be compared to other booleans", backtrace);
            }
            break;
        case cJSON_NULL:
            return 1;
            break;
        case cJSON_Number:
            if (r->type != cJSON_Number) {
                throw runtime_exc_t("Numbers can only be compared to other numbers.", backtrace);
            }
            if (l->valuedouble < r->valuedouble) {
                return -1;
            } else if (l->valuedouble > r->valuedouble) {
                return 1;
            } else {
                return 0;   // TODO: Handle NaN?
            }
            break;
        case cJSON_String:
            if (r->type != cJSON_String) {
                throw runtime_exc_t("Strings can only be compared to other strings.", backtrace);
            }
            return strcmp(l->valuestring, r->valuestring) < 0;
            break;
        case cJSON_Array:
            if (r->type == cJSON_Array) {
                int lsize = cJSON_GetArraySize(l),
                    rsize = cJSON_GetArraySize(r);
                for (int i = 0; i < lsize; ++i) {
                    if (i >= rsize) {
                        return 1;  // e.g. cmp([0, 1], [0])
                    }
                    int cmp = cJSON_cmp(cJSON_GetArrayItem(l, i), cJSON_GetArrayItem(r, i), backtrace);
                    if (cmp) {
                        return cmp;
                    }
                }
                return -1;  // e.g. cmp([0], [0, 1]);
            } else {
                throw runtime_exc_t("Strings can only be compared to other strings.", backtrace);
            }
            break;
        case cJSON_Object:
            throw runtime_exc_t("Can't compare objects.", backtrace);
            break;
        default:
            unreachable();
            break;
    }
}

} // namespace query_language 
