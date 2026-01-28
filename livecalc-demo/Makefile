# LiveCalc Demo Makefile
# Builds the projection benchmark executable

CXX = g++
CXXFLAGS = -std=c++17 -O3 -Wall -Wextra -I../livecalc-engine/src

# Check for Apache Arrow (Parquet support)
ARROW_LIBS = $(shell pkg-config --libs arrow parquet 2>/dev/null)
ARROW_CFLAGS = $(shell pkg-config --cflags arrow parquet 2>/dev/null)

ifneq ($(ARROW_LIBS),)
    CXXFLAGS += -DHAVE_ARROW $(ARROW_CFLAGS)
    LDFLAGS += $(ARROW_LIBS)
    HAVE_ARROW = yes
else
    HAVE_ARROW = no
endif

# Link against the livecalc engine library
ENGINE_LIB = ../livecalc-engine/build/liblivecalc.a

# JSON library (header-only, should be in engine's build/_deps)
JSON_INCLUDE = -I../livecalc-engine/build/_deps/json-src/include

# Target
TARGET = benchmark_projection

# Source files
SRCS = benchmark_projection.cpp

# Object files
OBJS = $(SRCS:.cpp=.o)

.PHONY: all clean check-deps

all: check-deps $(TARGET)

check-deps:
	@echo "Checking dependencies..."
	@echo "  Arrow/Parquet: $(HAVE_ARROW)"
	@if [ "$(HAVE_ARROW)" = "no" ]; then \
		echo ""; \
		echo "ERROR: Apache Arrow/Parquet not found."; \
		echo "Please install Arrow:"; \
		echo "  macOS: brew install apache-arrow"; \
		echo "  Ubuntu: sudo apt install libarrow-dev libparquet-dev"; \
		echo ""; \
		exit 1; \
	fi
	@if [ ! -f "$(ENGINE_LIB)" ]; then \
		echo ""; \
		echo "ERROR: LiveCalc engine library not found at $(ENGINE_LIB)"; \
		echo "Please build the engine first:"; \
		echo "  cd ../livecalc-engine/build && make"; \
		echo ""; \
		exit 1; \
	fi
	@echo "✓ Dependencies OK"
	@echo ""

$(TARGET): $(OBJS)
	@echo "Linking $(TARGET)..."
	$(CXX) $(CXXFLAGS) $(JSON_INCLUDE) -o $@ $^ $(ENGINE_LIB) $(LDFLAGS)
	@echo "✓ Built $(TARGET)"

%.o: %.cpp
	@echo "Compiling $<..."
	$(CXX) $(CXXFLAGS) $(JSON_INCLUDE) -c $< -o $@

clean:
	rm -f $(OBJS) $(TARGET)
	@echo "✓ Cleaned"

# Run the benchmark
run: $(TARGET)
	./$(TARGET)

# Run with custom parameters
run-quick: $(TARGET)
	./$(TARGET) --scenarios 100 --years 10

# Show help
help:
	./$(TARGET) --help
