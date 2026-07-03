# Makefile for SmartCity Traffic Simulator C++ Engine (Windows MSYS2 UCRT64)
# Run with: mingw32-make

CXX = g++
CXXFLAGS = -O3 -fopenmp -std=c++20 -Wall

TARGET = traffic_engine.exe
SRC = traffic_engine.cpp

all: $(TARGET)

$(TARGET): $(SRC)
	$(CXX) $(CXXFLAGS) $(SRC) -o $(TARGET)

clean:
	-del /q /f $(TARGET) *.o 2>nul
