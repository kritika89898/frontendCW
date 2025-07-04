import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const GRID_SIZE = 5;
const EMPTY = 0;
const RED = 1;
const BLUE = 2;

// Game modes
const GAME_MODES = {
  PVP: 'pvp',
  PVC: 'pvc'
};

const ColorWars = () => {
  // Initialize empty 5x5 grid
  const initializeGrid = () => {
    return Array(GRID_SIZE).fill().map(() => 
      Array(GRID_SIZE).fill().map(() => ({ count: 0, color: EMPTY }))
    );
  };

  const [grid, setGrid] = useState(initializeGrid);
  const [currentPlayer, setCurrentPlayer] = useState(RED);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [scores, setScores] = useState({ red: 0, blue: 0 });
  const [moveCount, setMoveCount] = useState(0);
  const [gameMode, setGameMode] = useState(null); // null = mode selection, 'pvp' = player vs player, 'pvc' = player vs computer
  const [isComputerThinking, setIsComputerThinking] = useState(false);

  // Calculate cell capacity based on position (corners=2, edges=3, center=4)
  const getCellCapacity = (row, col) => {
    const isCorner = (row === 0 || row === GRID_SIZE - 1) && (col === 0 || col === GRID_SIZE - 1);
    const isEdge = row === 0 || row === GRID_SIZE - 1 || col === 0 || col === GRID_SIZE - 1;
    
    if (isCorner) return 2;
    if (isEdge) return 3;
    return 4;
  };

  // Get adjacent cells for explosion distribution
  const getAdjacentCells = (row, col) => {
    const adjacent = [];
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // up, down, left, right
    
    directions.forEach(([dRow, dCol]) => {
      const newRow = row + dRow;
      const newCol = col + dCol;
      if (newRow >= 0 && newRow < GRID_SIZE && newCol >= 0 && newCol < GRID_SIZE) {
        adjacent.push([newRow, newCol]);
      }
    });
    
    return adjacent;
  };

  // AI Logic for computer player
  const getComputerMove = useCallback((gameGrid) => {
    const validMoves = [];
    
    // Find all valid moves (empty cells or computer's own cells)
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const cell = gameGrid[row][col];
        if (cell.color === EMPTY || cell.color === BLUE) {
          validMoves.push({ row, col, cell });
        }
      }
    }

    if (validMoves.length === 0) return null;

    // AI Strategy: Score each move
    const scoredMoves = validMoves.map(move => {
      const { row, col, cell } = move;
      let score = 0;
      const capacity = getCellCapacity(row, col);
      
      // 1. Prefer moves that will cause explosions
      if (cell.count + 1 >= capacity) {
        score += 100; // High priority for explosions
        
        // Extra points if this explosion will convert enemy cells
        const adjacent = getAdjacentCells(row, col);
        const enemyCells = adjacent.filter(([r, c]) => gameGrid[r][c].color === RED).length;
        score += enemyCells * 20;
      }
      
      // 2. Avoid cells that are almost full (dangerous for opponent)
      if (cell.count + 2 >= capacity) {
        score -= 30; // Penalty for making it easy for opponent
      }
      
      // 3. Prefer center positions (more strategic)
      const distanceFromCenter = Math.abs(row - 2) + Math.abs(col - 2);
      score += (4 - distanceFromCenter) * 5;
      
      // 4. Prefer cells that already have our orbs
      if (cell.color === BLUE) {
        score += 15;
      }
      
      // 5. Look for defensive moves - prevent opponent explosions
      const adjacentToOpponent = getAdjacentCells(row, col).some(([r, c]) => {
        const adjCell = gameGrid[r][c];
        return adjCell.color === RED && adjCell.count + 1 >= getCellCapacity(r, c);
      });
      
      if (adjacentToOpponent) {
        score += 25; // Bonus for defensive moves
      }
      
      return { ...move, score };
    });

    // Sort by score and pick the best move (with some randomness for variety)
    scoredMoves.sort((a, b) => b.score - a.score);
    
    // Add some randomness - pick from top 3 moves if available
    const topMoves = scoredMoves.slice(0, Math.min(3, scoredMoves.length));
    const selectedMove = topMoves[Math.floor(Math.random() * topMoves.length)];
    
    return { row: selectedMove.row, col: selectedMove.col };
  }, []);

  // Handle cell explosions and chain reactions
  const handleExplosions = useCallback((newGrid, player) => {
    let hasExplosions = true;
    let explosionGrid = newGrid.map(row => [...row]);

    while (hasExplosions) {
      hasExplosions = false;
      const nextGrid = explosionGrid.map(row => row.map(cell => ({ ...cell })));

      for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
          const cell = explosionGrid[row][col];
          const capacity = getCellCapacity(row, col);

          if (cell.count >= capacity) {
            hasExplosions = true;
            
            // Reset current cell
            nextGrid[row][col] = { count: 0, color: EMPTY };
            
            // Distribute orbs to adjacent cells
            const adjacentCells = getAdjacentCells(row, col);
            adjacentCells.forEach(([adjRow, adjCol]) => {
              nextGrid[adjRow][adjCol].count += 1;
              nextGrid[adjRow][adjCol].color = player;
            });
          }
        }
      }

      explosionGrid = nextGrid;
    }

    return explosionGrid;
  }, []);

  // Calculate scores
  const calculateScores = useCallback((gameGrid) => {
    let redCount = 0;
    let blueCount = 0;

    gameGrid.forEach(row => {
      row.forEach(cell => {
        if (cell.color === RED) redCount += cell.count;
        if (cell.color === BLUE) blueCount += cell.count;
      });
    });

    return { red: redCount, blue: blueCount };
  }, []);

  // Check win condition
  const checkWinCondition = useCallback((gameGrid, totalMoves) => {
    const newScores = calculateScores(gameGrid);
    const totalOrbs = newScores.red + newScores.blue;
    
    // Only check for winner after both players have had at least one turn (moveCount >= 2)
    // and when there are orbs on the board
    if (totalOrbs > 0 && totalMoves >= 2) {
      if (newScores.red === 0 && newScores.blue > 0) return BLUE;
      if (newScores.blue === 0 && newScores.red > 0) return RED;
    }
    
    return null;
  }, [calculateScores]);

  // Handle computer move
  const makeComputerMove = useCallback(() => {
    if (gameMode !== GAME_MODES.PVC || currentPlayer !== BLUE || gameOver) return;
    
    setIsComputerThinking(true);
    
    // Add delay for better UX
    setTimeout(() => {
      const computerMove = getComputerMove(grid);
      if (computerMove) {
        // Simulate cell click for computer
        const cell = grid[computerMove.row][computerMove.col];
        
        // Create new grid with added orb
        const newGrid = grid.map((gridRow, r) =>
          gridRow.map((gridCell, c) => {
            if (r === computerMove.row && c === computerMove.col) {
              return {
                count: gridCell.count + 1,
                color: BLUE
              };
            }
            return { ...gridCell };
          })
        );

        // Handle explosions and chain reactions
        const finalGrid = handleExplosions(newGrid, BLUE);
        
        // Update move count
        const newMoveCount = moveCount + 1;
        setMoveCount(newMoveCount);
        
        // Update game state
        setGrid(finalGrid);
        setScores(calculateScores(finalGrid));
        
        // Check for winner
        const winnerPlayer = checkWinCondition(finalGrid, newMoveCount);
        if (winnerPlayer) {
          setWinner(winnerPlayer);
          setGameOver(true);
        } else {
          // Switch to human player
          setCurrentPlayer(RED);
        }
      }
      setIsComputerThinking(false);
    }, 1000 + Math.random() * 1000); // 1-2 second delay
  }, [gameMode, currentPlayer, gameOver, grid, getComputerMove, handleExplosions, moveCount, calculateScores, checkWinCondition]);

  // Trigger computer move when it's computer's turn
  useEffect(() => {
    if (gameMode === GAME_MODES.PVC && currentPlayer === BLUE && !gameOver && !isComputerThinking) {
      makeComputerMove();
    }
  }, [currentPlayer, gameMode, gameOver, isComputerThinking, makeComputerMove]);

  // Handle cell click
  const handleCellClick = (row, col) => {
    if (gameOver || (gameMode === GAME_MODES.PVC && currentPlayer === BLUE)) return;

    const cell = grid[row][col];
    
    // Can only place in empty cells or own cells
    if (cell.color !== EMPTY && cell.color !== currentPlayer) return;

    // Create new grid with added orb
    const newGrid = grid.map((gridRow, r) =>
      gridRow.map((gridCell, c) => {
        if (r === row && c === col) {
          return {
            count: gridCell.count + 1,
            color: currentPlayer
          };
        }
        return { ...gridCell };
      })
    );

    // Handle explosions and chain reactions
    const finalGrid = handleExplosions(newGrid, currentPlayer);
    
    // Update move count
    const newMoveCount = moveCount + 1;
    setMoveCount(newMoveCount);
    
    // Update game state
    setGrid(finalGrid);
    setScores(calculateScores(finalGrid));
    
    // Check for winner
    const winnerPlayer = checkWinCondition(finalGrid, newMoveCount);
    if (winnerPlayer) {
      setWinner(winnerPlayer);
      setGameOver(true);
    } else {
      // Switch player
      setCurrentPlayer(currentPlayer === RED ? BLUE : RED);
    }
  };

  // Start game with selected mode
  const startGame = (mode) => {
    setGameMode(mode);
    setGrid(initializeGrid());
    setCurrentPlayer(RED);
    setGameOver(false);
    setWinner(null);
    setScores({ red: 0, blue: 0 });
    setMoveCount(0);
    setIsComputerThinking(false);
  };

  // Restart game
  const restartGame = () => {
    setGrid(initializeGrid());
    setCurrentPlayer(RED);
    setGameOver(false);
    setWinner(null);
    setScores({ red: 0, blue: 0 });
    setMoveCount(0);
    setIsComputerThinking(false);
  };

  // Back to menu
  const backToMenu = () => {
    setGameMode(null);
    restartGame();
  };

  // Render orbs in a cell
  const renderCell = (cell, row, col) => {
    const { count, color } = cell;
    
    if (count === 0) {
      return (
        <div 
          key={`${row}-${col}`}
          className="w-16 h-16 bg-gray-800 border-2 border-gray-600 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors duration-200 flex items-center justify-center"
          onClick={() => handleCellClick(row, col)}
        />
      );
    }

    const colorClass = color === RED ? 'text-red-500' : 'text-blue-500';
    const bgClass = color === RED ? 'bg-red-900/30' : 'bg-blue-900/30';
    const borderClass = color === RED ? 'border-red-500/50' : 'border-blue-500/50';

    return (
      <div 
        key={`${row}-${col}`}
        className={`w-16 h-16 ${bgClass} border-2 ${borderClass} rounded-lg cursor-pointer hover:brightness-110 transition-all duration-200 flex items-center justify-center ${colorClass}`}
        onClick={() => handleCellClick(row, col)}
      >
        <div className="flex flex-wrap justify-center items-center gap-1">
          {Array(count).fill().map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full ${color === RED ? 'bg-red-500' : 'bg-blue-500'}`} />
          ))}
        </div>
        <span className="absolute text-xs font-bold">{count}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Game Mode Selection */}
        {!gameMode && (
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent">
              COLOR WARS
            </h1>
            <div className="space-y-4">
              <button
                onClick={() => startGame(GAME_MODES.PVC)}
                className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-lg transition-all duration-200 border border-blue-500 shadow-lg hover:shadow-xl"
              >
                🤖 Play vs Computer
              </button>
              <button
                onClick={() => startGame(GAME_MODES.PVP)}
                className="w-full px-6 py-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold rounded-lg transition-all duration-200 border border-red-500 shadow-lg hover:shadow-xl"
              >
                👥 Play vs Friend
              </button>
            </div>
            <div className="mt-8 text-xs text-gray-400 text-center">
              <p className="mb-2">• Click empty cells or your own cells to add orbs</p>
              <p className="mb-2">• Cells explode when they reach capacity (corners: 2, edges: 3, center: 4)</p>
              <p>• Eliminate all opponent orbs to win!</p>
            </div>
          </div>
        )}

        {/* Game Interface */}
        {gameMode && (
          <>
            {/* Header */}
            <div className="text-center mb-6">
              <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent">
                COLOR WARS
              </h1>
              
              {/* Game Mode Indicator */}
              <div className="mb-4 text-sm text-gray-400">
                {gameMode === GAME_MODES.PVC ? '🤖 vs Computer' : '👥 vs Friend'}
              </div>
              
              {/* Scores */}
              <div className="flex justify-between items-center mb-4 bg-gray-900 rounded-lg p-3">
                <div className="text-red-500 font-bold">
                  {gameMode === GAME_MODES.PVC ? 'YOU' : 'RED'}: {scores.red}
                </div>
                <div className="text-blue-500 font-bold">
                  {gameMode === GAME_MODES.PVC ? 'COMPUTER' : 'BLUE'}: {scores.blue}
                </div>
              </div>
              
              {/* Current Turn */}
              {!gameOver && (
                <div className="mb-4">
                  <span className="text-gray-400">Current Turn: </span>
                  {isComputerThinking ? (
                    <span className="text-blue-500 font-bold animate-pulse">
                      🤖 Computer Thinking...
                    </span>
                  ) : (
                    <span className={`font-bold ${currentPlayer === RED ? 'text-red-500' : 'text-blue-500'}`}>
                      {gameMode === GAME_MODES.PVC ? 
                        (currentPlayer === RED ? 'YOUR TURN' : 'COMPUTER') :
                        (currentPlayer === RED ? 'RED' : 'BLUE')
                      }
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Game Grid */}
            <div className="grid grid-cols-5 gap-2 mb-6 bg-gray-900 p-4 rounded-lg">
              {grid.map((row, rowIndex) =>
                row.map((cell, colIndex) => renderCell(cell, rowIndex, colIndex))
              )}
            </div>

            {/* Game Over Screen */}
            {gameOver && (
              <div className="text-center mb-4 bg-gray-900 rounded-lg p-6">
                <h2 className="text-2xl font-bold mb-2">GAME OVER!</h2>
                <p className={`text-xl mb-4 ${winner === RED ? 'text-red-500' : 'text-blue-500'}`}>
                  {gameMode === GAME_MODES.PVC ? 
                    (winner === RED ? 'YOU WIN! 🎉' : 'COMPUTER WINS! 🤖') :
                    (winner === RED ? 'RED WINS!' : 'BLUE WINS!')
                  }
                </p>
              </div>
            )}

            {/* Controls */}
            <div className="flex justify-center gap-4">
              <button
                onClick={restartGame}
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-lg transition-colors duration-200 border border-gray-600"
              >
                {gameOver ? 'PLAY AGAIN' : 'RESTART'}
              </button>
              <button
                onClick={backToMenu}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors duration-200 border border-gray-500"
              >
                MENU
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ColorWars;
