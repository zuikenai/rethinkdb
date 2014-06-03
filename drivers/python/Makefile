TOP ?= ../..
PROTO_FILE_SRC=$(TOP)/src/rdb_protocol/ql2.proto
PROTO_FILE_PY_NAME=ql2_pb2.py
PY_PKG_DIR=$(TOP)/build/packages/python
PY_BUILD_DIR=$(TOP)/build/drivers/python
PY_SRC_DIR=rethinkdb

# convenience file for driver development
PY_PROTO_DEV_FILE=$(PY_SRC_DIR)/$(PROTO_FILE_PY_NAME)

PY_SRC_FILES := $(filter-out $(PY_SRC_DIR)/$(PROTO_FILE_PY_NAME),$(wildcard $(PY_SRC_DIR)/*.py))

PY_PB_BUILD_FILE := $(PY_BUILD_DIR)/rethinkdb/$(PROTO_FILE_PY_NAME)
PY_BUILD_FILES := $(patsubst $(PY_SRC_DIR)/%,$(PY_BUILD_DIR)/rethinkdb/%,$(PY_SRC_FILES)) $(PY_PB_BUILD_FILE)

PY_PACKAGE_FILES := $(patsubst $(PY_SRC_DIR)/%,$(PY_PKG_DIR)/rethinkdb/%,$(PY_SRC_FILES))

all: $(PY_BUILD_FILES) $(PY_PROTO_DEV_FILE)

%/$(PROTO_FILE_PY_NAME): $(PROTO_FILE_SRC)
	../convert_protofile --language python --input-file $(PROTO_FILE_SRC) --output-file $@

$(PY_PKG_DIR):
	mkdir -p $(PY_PKG_DIR)

$(PY_BUILD_DIR):
	mkdir -p $(PY_BUILD_DIR)/rethinkdb

$(PY_BUILD_DIR)/%.py: %.py | $(PY_BUILD_DIR)
	cp $< $@

.PHONY: all clean publish sdist install

clean:
	rm -rf $(PY_BUILD_DIR)
	rm -rf $(PY_PKG_DIR)
	rm -f $(PY_PROTO_DEV_FILE)

sdist: $(PY_BUILD_FILES) $(PY_PKG_DIR) $(PY_BUILD_DIR)/setup.py
	cd $(PY_BUILD_DIR) && python setup.py --quiet sdist --dist-dir=$(abspath $(PY_PKG_DIR))

bdist: $(PY_BUILD_FILES) $(PY_PKG_DIR) $(PY_BUILD_DIR)/setup.py
	cd $(PY_BUILD_DIR) && python setup.py --quiet bdist_egg --dist-dir=$(abspath $(PY_PKG_DIR))

publish: sdist
	cd $(PY_BUILD_DIR) && python setup.py --quiet register sdist --dist-dir=$(abspath $(PY_PKG_DIR)) upload 

install: sdist
	cd $(PY_BUILD_DIR) && python setup.py --quiet install

