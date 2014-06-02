RETHINKDB_HOME=../..
PROTO_FILE_SRC=$(RETHINKDB_HOME)/src/rdb_protocol/ql2.proto
PROTO_FILE_OUTPUT_NAME=ql2_pb2.py
PY_PKG_DIR=$(RETHINKDB_HOME)/build/packages/python
PY_BUILD_DIR=$(RETHINKDB_HOME)/build/drivers/python
PY_SRC_DIR=rethinkdb

PY_SRC_FILES := $(filter-out $(PY_SRC_DIR)/$(PROTO_FILE_OUTPUT_NAME),$(wildcard $(PY_SRC_DIR)/*.py))

PY_PB_BUILD_FILE := $(PY_BUILD_DIR)/rethinkdb/$(PROTO_FILE_OUTPUT_NAME)
PY_BUILD_FILES := $(patsubst $(PY_SRC_DIR)/%,$(PY_BUILD_DIR)/rethinkdb/%,$(PY_SRC_FILES))

PY_PB_PACKAGE_FILE=$(PY_PKG_DIR)/rethinkdb/$(PROTO_FILE_OUTPUT_NAME)
PY_PACKAGE_FILES := $(patsub $(PY_SRC_DIR)/%,$(PY_PKG_DIR)/rethinkdb/%,$(PY_SRC_FILES))

all: $(PY_BUILD_FILES) $(PY_PB_BUILD_FILE)

# - build directory

$(PY_BUILD_DIR):
	mkdir -p $(PY_BUILD_DIR)/rethinkdb

$(PY_BUILD_DIR)/rethinkdb/%.py: $(PY_SRC_DIR)/%.py | $(PY_BUILD_DIR)
	cp $< $@

$(PY_BUILD_DIR)/rethinkdb/$(PROTO_FILE_OUTPUT_NAME): $(PROTO_FILE_SRC) | $(PY_BUILD_DIR)
	../convert_protofile --language python --input-file $(PROTO_FILE_SRC) --output-file $@
	# TODO: remove this when nothing trys to use it
	cp $< rethinkdb/

# - package directory

$(PY_PKG_DIR)/setup.py: setup.py
	cp setup.py $@

$(PY_PKG_DIR):
	mkdir -p $(PY_PKG_DIR)/rethinkdb

$(PY_PKG_DIR)/rethinkdb/%.py: rethinkdb/%.py | $(PY_PKG_DIR)
	cp $< $@

$(PY_PB_PACKAGE_FILE): $(PROTO_FILE_SRC) | $(PY_PKG_DIR)
	../convert_protofile --language python --input-file $(PROTO_FILE_SRC) --output-file $@

# -

.PHONY: all clean publish sdist install

clean:
	rm -rf $(PY_BUILD_DIR)
	rm -rf $(PY_PKG_DIR)
	# TODO: remove this when removing above
	rm -f rethinkdb/$(basename $(PY_PB_BUILD_FILE))

sdist: $(PY_PB_PACKAGE_FILE) $(PY_PACKAGE_FILES) $(PY_PKG_DIR)/setup.py
	cd $(PY_PKG_DIR) && python setup.py sdist

bdist: $(PY_PB_PACKAGE_FILE) $(PY_PACKAGE_FILES) $(PY_PKG_DIR)/setup.py
	cd $(PY_PKG_DIR) && python setup.py bdist_egg

publish: sdist
	cd $(PY_PKG_DIR) && python setup.py register sdist upload

install: sdist
	cd $(PY_PKG_DIR) && python setup.py install

