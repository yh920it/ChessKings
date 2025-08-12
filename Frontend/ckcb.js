// Helper function to get piece symbols
function getPieceSymbol(type, color) {
    const symbols = {
        white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
        black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟︎' },
    };
    if (!symbols[color]) {
        console.error(`Invalid color: ${color}`);
        return '';
    }
    if (!symbols[color][type]) {
        console.error(`Invalid type: ${type}`);
        return '';
    }
    return symbols[color][type];
}

// Function to set a piece on a box
var setPiece = function (box, color, type) {
    if (typeof box === 'string') {
        box = document.getElementById(box); // Resolve ID to an element
    }

    if (!box) {
        console.error("Box not found:", box);
        return;
    }

    if (box.getAttribute('data-piece') && box.getAttribute('data-color')) {
        console.warn(`Box ${box.id} already has a piece:`, box.getAttribute('data-piece'));
    }

    box.setAttribute('data-piece', type);
    box.setAttribute('data-color', color);
    box.textContent = getPieceSymbol(type, color);
};

// Determine piece type based on position
function determineType(i, j) {
    const types = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
    if (j === 0 || j === 7) {
        return types[i] || null;
    } else if (j === 1 || j === 6) {
        return 'pawn';
	     }
    return null;
}

// Determine piece color based on position
function determineColor(j) {
    return j < 2 ? 'black' : 'white'; // First two rows black, last two rows white
}

// Initialize the board with pieces
var initializeBox = function (i, j) {
    const boxId = `box-${i}-${j}`;
    const box = document.getElementById(boxId);

    if (!box) {
        console.error(`Box not found for ID: ${boxId}`);
        return;
    }

    const pieceType = determineType(i, j);
    const pieceColor = determineColor(j);

    if (pieceType && pieceColor) {
        setPiece(boxId, pieceColor, pieceType);
    }
};

var setNewBoard = function () {
    for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 8; i++) {
            initializeBox(i, j);
        }
    }
};

// AngularJS Controller to initialize the board
angular.module('myApp').controller('GameController', ['$scope', '$timeout', '$http', '$interval', function ($scope, $timeout, $http, $interval) {
    $scope.widths = Array.from({ length: 8 }, (_, i) => i); // Create an array [0, 1, 2, ..., 7]

    $scope.initializeBoard = function () {
        $timeout(function () {
            console.log("Setting up the board...");
            setNewBoard(); // Use consolidated logic
        }, 0);
	      };

    $scope.chatMessages = []; // Array to hold chat messages
    $scope.newMessage = '';   // Model for the input field

    $scope.sendMessage = function() {
        if ($scope.newMessage.trim() !== '') {
            $http.post('/chat.php', { message: $scope.newMessage })
                .then(function(response) {
                    $scope.chatMessages.push(response.data.message); // Add the backend's response
                    $scope.newMessage = ''; // Clear input field
                })
                .catch(function(error) {
                    console.error("Failed to send message:", error);
                });
        }
    };

    $scope.currentPlayerId = window.currentPlayerId;

    $scope.joinMatchmaking = function() {
        if (!$scope.currentPlayerId) {
            alert("You must log in to join matchmaking.");
            return;
        }

        $scope.matchmakingStatus = "Joining matchmaking...";
        $scope.loadingSpinnerVisible = true;

        $http.post('/matchmaking.php', { playerId: $scope.currentPlayerId })
            .then(function(response) {
                console.log("Matchmaking response:", response.data);
                $scope.matchmakingStatus = "Waiting for a match...";
                $scope.loadingSpinnerVisible = false;
                $scope.listenForGameUpdates();
            })
            .catch(function(error) {
                console.error("Matchmaking error:", error);
                $scope.matchmakingStatus = "Failed to join matchmaking. Try again.";
                $scope.loadingSpinnerVisible = false;
            });
    };

    $scope.listenForGameUpdates = function() {
	      let retryCount = 0;
        console.log("Listening for game updates...");
        $scope.polling = $interval(function() {
            $http.get('/getmmstatus.php')
                .then(function(response) {
                    if (response.data.status === 'success') {
                        document.getElementById('matchmaking-status').innerText = 'Match found! Starting game...';
                        $scope.startGame(response.data);
                        $interval.cancel($scope.polling);
                    }
                })
                .catch(function(error) {
                    retryCount++;
                    console.error(`Polling error (retry ${retryCount}):`, error);
                    if (retryCount > 5) {
                        $interval.cancel($scope.polling);
                    }
                });
        }, 2000 * Math.pow(2, retryCount)); // Exponential backoff
    };

    $scope.startGame = function(gameData) {
        console.log('Game started with ID:', gameData.gameId);
        $scope.player1 = gameData.player1;
        $scope.player2 = gameData.player2;
    };

    $scope.initializeBoard();
}]);

$(document).ready(function() {
    const themes = [
        {
            name: 'CLASSIC',
            boardBorderColor: '#666',
            lightBoxColor: '#fff',
            darkBoxColor: '#ccc',
            optionColor: '#000',
            optionHoverColor: '#999'
        },
        {
            name: 'WOOD',
            boardBorderColor: '#803E04',
            lightBoxColor: '#FFCE9E',
		 lightBoxColor: '#FFCE9E',
            darkBoxColor: '#D18B47',
            optionColor: '#803E04',
            optionHoverColor: '#311B0B'
        },
        {
            name: 'OCEAN',
            boardBorderColor: '#023850',
            lightBoxColor: '#fff',
            darkBoxColor: '#0A85AE',
            optionColor: '#023850',
            optionHoverColor: '#3385ff'
        },
        {
            name: 'FOREST',
            boardBorderColor: '#005900',
            lightBoxColor: '#CAC782',
            darkBoxColor: '#008C00',
            optionColor: '#005900',
            optionHoverColor: '#0c0'
        },
        {
            name: 'BLOOD',
            boardBorderColor: '#f3f3f3',
            lightBoxColor: '#f3f3f3',
            darkBoxColor: '#f00',
            optionColor: '#f00',
            optionHoverColor: '#f99'
        }
    ];

    let themeOption = 0;

    $('#theme-option').on('click', function() {
        themeOption = (themeOption + 1) % themes.length;
        setTheme();
    });

    function setTheme() {
        const theme = themes[themeOption];
        $('#theme-option').html(theme.name);
        $('#board').css('border-color', theme.boardBorderColor);
        $('.light-box').css('background', theme.lightBoxColor);
        $('.dark-box').css('background', theme.darkBoxColor);
	    $('#board').css('border-color', theme.boardBorderColor);
        $('.light-box').css('background', theme.lightBoxColor);
        $('.dark-box').css('background', theme.darkBoxColor);
        $('.option-nav, #option, #undo-btn').css('color', theme.optionColor);
    }

    setTheme();
});    
    //Set up theme
    var setTheme = function() {
        var theme = themes[themeOption];

        $('#theme-option').html(theme.name);

        $('#board').css('border-color', theme.boardBorderColor);
        $('.light-box').css('background', theme.lightBoxColor);
        $('.dark-box').css('background', theme.darkBoxColor);

        $('.option-nav').css('color', theme.optionColor);

        //Option button effect
        $('#option').css('color', theme.optionColor);
        $('#option').hover(
            function() {
                $(this).css('color', theme.optionHoverColor);
            }, function() {
                $(this).css('color', theme.optionColor);
            }
        );

        //Undo button effect
        $('#undo-btn').css('color', theme.optionColor);
        $('#undo-btn').hover(
            function() {
                $(this).css('color', theme.optionHoverColor);
            }, function() {
                $(this).css('color', theme.optionColor);
            }
        );

        //Option Menu effect
        $('#option-menu').css('color', theme.optionColor);
        $('.button').css('color', theme.optionColor);
        $('.button').hover(
		 function() {
                $(this).css('color', theme.optionHoverColor);
            }, function() {
                $(this).css('color', theme.optionColor);
            }
        );
    }
    
    //Change color
    $('#color-option').on('click', function() {
       colorOption === colors.length - 1 ? colorOption = 0 : colorOption++;

        setColor();
    });
    
    //Set up color for chess pieces
    var setColor = function() {
        var color = colors[colorOption];

        $('#color-option').html(color.name);

        $('.box').css('color', color['color']);

        $('#pawn-promotion-option').css('color', color['color']);

        $('#player').css('color', color['color']);
    }

         //=====GLOBAL VARIABLES=========//

        //Chess pieces
        var chessPieces = {
                 'white': {
                          'king': '&#9812;',
                          'queen': '&#9813;',
                          'rook': '&#9814;',
                          'bishop': '&#9815;',
                          'knight': '&#9816;',
                          'pawn': '&#9817;'
                 },
                 'black': {
                          'king': '&#9818;',
                          'queen': '&#9819;',
                          'rook': '&#9820;',
			  'bishop': '&#9821;',
                          'knight': '&#9822;',
                          'pawn': '&#9823;'
                 }
        };

        var player = 'white'; //First player

        //Selected chess piece to move
        var select = {
                 canMove: false, //Ready to move of not
                 piece: '',      //Color, type of the piece
                 box: ''         //Position of the piece
        }

        //Game's history (pieces + positions)
        var historyMoves = [];

        //Position and color of pawn promotion
        var promotion = {};

        //Set up board game
        $(function() {           
                $('#player').html(chessPieces.white.king);

                 //Set up color for boxes, chess pieces
                 for(var i = 0; i < 8; i++) {
                          for(var j = 0; j < 8; j++) {
                                        var box = $('#box-' + i + '-' + j);
                                        if((i + j) % 2 !== 0) {
                                                 box.addClass('light-box');
                                        } else {
                                                 box.addClass('dark-box');
                                        }
                                        setNewBoard(box, i, j); //Set up all chess pieces
                          }
                 }
                 setColor();
                 setTheme();
        });

        //==============CLICK EVENTS==================//

                $(function() {
			  $(function() {
                         //Option menu
                         $('#option').on('click', function() {
                                  if($('#option-menu').hasClass('hide')) {
                                                $('#game').css('opacity', '0.3');
                                                $('#option-menu').removeClass('hide');
                                  } else {
                                                $('#game').css('opacity', '1');
                                                $('#option-menu').addClass('hide');
                                  }
                         });

                         //Back button
                         //Return to game
                         $('#back-btn').on('click', function() {
                                  $('#option-menu').addClass('hide');
                                  $('#game').css('opacity', '1');
                         });

                 //Undo button 
                 $('#undo-btn').on('click', function() {
                          if(historyMoves.length === 0) {
                                        return;
                          }

                          var move = historyMoves.pop();

                          var previous = move.previous;        
                          setPiece($('#' + previous.box), previous.piece.split('-')[0], previous.piece.split('-')[1]);

                          var current = move.current;
                          if(current.piece === '') {
                                        var currentBox = $('#' + current.box);
                                        currentBox.html('');
                                        currentBox.attr('piece', '');
                                        currentBox.removeClass('placed');
                          } else {
                                        setPiece($('#' + current.box), current.piece.split('-')[0], current.piece.split('-')[1]);
                          }

                          //Reset all changes
                          $('.box').removeClass('selected');
                          $('.box').removeClass('suggest');
			   switchPlayer();

                          select = { canMove: false, piece: '', box: '' };
                 });

                 // Option menu
                $('#option').on('click', function() {
                if ($('#option-menu').hasClass('hide')) {
                        $('#game').css('opacity', '0.3');
                        $('#option-menu').removeClass('hide');
                } else {
                        $('#game').css('opacity', '1');
                        $('#option-menu').addClass('hide');
                }
                });


                 //Pawn promotion event
                 $('#pawn-promotion-option .option').on('click', function() {

                          var newType = $(this).attr('id');
                          promotion.box.html(chessPieces[promotion.color][newType]);
                          promotion.box.addClass('placed');
                          promotion.box.attr('piece', promotion.color + '-' + newType);

                          $('#pawn-promotion-option').addClass('hide');
                          $('#game').css('opacity', '1');

                          promotion = {};
                 });

                 //Reset game
                 $('#restart-btn').on('click', function() {
                          resetGame(); 
                 });

                 //Restart when game over
                 $('#result').on('click', function() {
                          resetGame();
                 });

                 //Box click event
                 $('.box').on('click', function() {
                          if($(this).hasClass('selected')) { //Undo to select new box
			      $(this).removeClass('selected');

                                        $('.box').removeClass('suggest');
                                        select = { canMove: false, piece: '', box: '' };
                                        return;
                          }

                          //Select new box
                          if(!select.canMove) {
                                        //Check the right color to play
                                        if($(this).attr('piece').indexOf(player) >= 0) {
                                                 //Select a piece to move
                                                 selectPiece($(this));
                                        }
                          }

                          //Set up new destination for selected box
                          else if(select.canMove) { 
                                        var selectedPieceInfo = select.piece.split('-');
                                        var color = selectedPieceInfo[0];
                                        var type = selectedPieceInfo[1];

                                        //Select new piece to move if 2 colors are the same
                                        if($(this).attr('piece').indexOf(color) >= 0) {
                                                 $('#' + select.box).removeClass('selected');
                                                 $('.box').removeClass('suggest');
                                                 //Select a piece to move
                                                 selectPiece($(this));
                                                 return;
                                        }

                                        //Can move if it is valid
                                        if($(this).hasClass('suggest')) { 

                                                 //Save move in history
                                                 var move = {
                                                          previous: {},
                                                          current: {}
                                                 }

                                                 move.previous.piece = select.piece;
                                                 move.previous.box = select.box;

                                                 move.current.piece = $(this).attr('piece');
						 move.current.box = $(this).attr('id');

                                                 historyMoves.push( move );

                                                 //Move selected piece successfully
                                                 setPiece($(this), color, type);

                                                 //Delete moved box
                                                 deleteBox($('#' + select.box));

                                                 $('.box').removeClass('suggest');

                                                 select = { canMove: false, piece: '', box: '' };

                                                 //Switch player
                                                 switchPlayer();
                                        }
                          }
                 });
        });

        //Get piece and position of the selected piece
        var selectPiece = function(box) {
                 box.addClass('selected');
                 select.box = box.attr('id');
                 select.piece = box.attr('piece');
                 select.canMove = true;

                 suggestNextMoves(getNextMoves(select.piece, select.box));
        }

        //CALCULATE VALID MOVES=======//

        //Returns possible moves of the selected piece
        var getNextMoves = function(selectedPiece, selectedBox) {
                 var selectedPieceInfo = selectedPiece.split('-');
                 var color = selectedPieceInfo[0];
                 var type = selectedPieceInfo[1];

                 var id = selectedBox.split('-');
                 var i = parseInt(id[1]);
                 var j = parseInt(id[2]);

                 var nextMoves = [];
		  switch(type) {
                          case 'pawn':
                                        if(color === 'black') {
                                                 var moves = [
                                                          [0, 1], [0, 2], [1, 1], [-1, 1]
                                                 ];
                                        } else {
                                                 var moves = [
                                                          [0, -1], [0, -2], [1, -1], [-1, -1]
                                                 ];
                                        }
                                        nextMoves = getPawnMoves(i, j, color, moves);
                                        break;
                          case 'rook':
                                        var moves = [
                                                 [0, 1], [0, -1], [1, 0], [-1, 0]
                                        ];
                                        nextMoves = getQueenMoves(i, j, color, moves);
                                        break;
                          case 'knight':
                                        var moves = [
                                                 [-1, -2], [-2, -1], [1, -2], [-2, 1],
                                                 [2, -1], [-1, 2], [2, 1], [1, 2]
                                        ];
                                        nextMoves = getKnightMoves(i, j, color, moves);
                                        break;
                          case 'bishop':
                                        var moves = [
                                                 [1, 1], [1, -1], [-1, 1], [-1, -1]
                                        ];
                                        nextMoves = getQueenMoves(i, j, color, moves);
                                        break;
                          case 'queen':
                                        var moves1 = [
                                                 [1, 1], [1, -1], [-1, 1], [-1, -1]
                                        ];
                                        var moves2 = [
                                                 [0, 1], [0, -1], [1, 0], [-1, 0]
                                        ];
                                        nextMoves = getQueenMoves(i, j, color, moves1)
                                                                        .concat(getQueenMoves(i, j, color, moves2));
                                        break;
                          case 'king':
                                        var moves = [
						[1, 1], [1, -1], [-1, 1], [-1, -1],
                                                 [0, 1], [0, -1], [1, 0], [-1, 0]
                                        ];
                                        nextMoves = getKnightMoves(i, j, color, moves);
                                        break;
                          default: 
                                        break;
                 }
                 return nextMoves;
        }

        //Calculate next moves for pawn pieces
        var getPawnMoves = function(i, j, color, moves) {
                 var nextMoves = [];
                 for(var index = 0; index < moves.length; index++) {
                          var tI = i + moves[index][0];
                          var tJ = j + moves[index][1];
                          if( !outOfBounds(tI, tJ) ) {
                                        var box = $('#box-' + tI + '-' + tJ);

                                        if(index === 0) { //First line
                                                 if(!box.hasClass('placed')) {
                                                          nextMoves.push([tI, tJ]);
                                                 } else {
                                                          index++;
                                                 }
                                        } else if(index === 1) { //First line
                                                 if( ((color === 'black' && j === 1) ||
                                                                 (color === 'white' && j === 6)) &&
                                                          !box.hasClass('placed')) {
                                                          nextMoves.push([tI, tJ]);
                                                 }
                                        } else if(index > 1) { //Other lines
                                                 if(box.attr('piece') !== '' && box.attr('piece').indexOf(color) < 0) {
                                                          nextMoves.push([tI, tJ]);
                                                 }
                                        }
                          }
                 }
                 return nextMoves;
        }

        //Calculate next move of rook, bishop and queen pieces
        var getQueenMoves = function(i, j, color, moves) {
		 var nextMoves = [];
                 for(var move of moves) {
                          var tI = i + move[0];
                          var tJ = j + move[1];
                          var sugg = true;
                          while(sugg && !outOfBounds(tI, tJ)) {
                                        var box = $('#box-' + tI + '-' + tJ);
                                        if(box.hasClass('placed')) {
                                                 if(box.attr('piece').indexOf(color) >= 0) {
                                                          sugg = false;
                                                 } else {
                                                          nextMoves.push([tI, tJ]);
                                                          sugg = false;
                                                 }
                                        }
                                        if(sugg) {
                                                 nextMoves.push([tI, tJ]);
                                                 tI += move[0];
                                                 tJ += move[1];
                                        }
                          }
                 }
                 return nextMoves;
        }

        //Calculate next moves for knight or king pieces
        var getKnightMoves = function(i, j, color, moves) {
                 var nextMoves = [];
                 for(var move of moves) {
                          var tI = i + move[0];
                          var tJ = j + move[1];
                          if( !outOfBounds(tI, tJ) ) {
                                        var box = $('#box-' + tI + '-' + tJ);
                                        if(!box.hasClass('placed') || box.attr('piece').indexOf(color) < 0) {
                                                 nextMoves.push([tI, tJ]);
                                        }
                          }
                 }
                 return nextMoves;
        }

        //Check if position i, j is in the board game
        var outOfBounds = function(i, j) {
                 return ( i < 0 || i >= 8 || j < 0 || j >= 8 );
		 }

        //Show possible moves by add suggestion to boxes
        var suggestNextMoves = function(nextMoves) {
                 for(var move of nextMoves) {
                          var box = $('#box-' + move[0] + '-' + move[1]);
                          box.addClass('suggest');
                 }
        }

        //=============================================//

        //Set up piece for clicked box
var setPiece = function(box, color, type) {
    if (!box || !box.length) {
        console.error("Box not found:", box);
        return;
    }

    if (typeof box.attr('piece') === 'undefined' || box.attr('piece') === '') {
        console.warn("Box is missing 'piece' attribute or it's empty. Initializing it:", box);
        box.attr('piece', `${color}-${type}`); // Initialize missing attribute
    }

    // Check if the piece is a king to handle endgame logic
    if (box.attr('piece').indexOf('king') >= 0) {
        console.log("King detected in box:", box);
        showWinner(player);
        return; // Prevent further processing for king
    }

    // Handle promotion
    const j = parseInt(box.attr('id').split('-')[2], 10);
    if (type === 'pawn' && ((player === 'black' && j === 7) || (player === 'white' && j === 0))) {
        console.log("Pawn promotion triggered for:", box);
        $('#pawn-promotion-option').removeClass('hide');
        promotion = { box: box, color: color };
        return;
    }

    // Update box with the new piece
    box.html(chessPieces[color][type]);
    box.addClass('placed');
    box.attr('piece', `${color}-${type}`);
	};

        //Delete selected element
        var deleteBox = function(box) {
                 box.removeClass('placed');
                 box.removeClass('selected');
                 box.removeClass('suggest');
                 box.html('');
                 box.attr('piece', '');
        }

        //Default board state
        var setNewBoard = function(box, i, j) {
                 if(j === 7) {
                          if(i === 0 || i === 7) {
                                        setPiece(box, 'white', 'rook');
                          } else if(i === 1 || i === 6) {
                                        setPiece(box, 'white', 'knight');
                          } else if(i === 2 || i === 5) {
                                        setPiece(box, 'white', 'bishop');
                          } else if(i === 3) {
                                        setPiece(box, 'white', 'queen');
                          } else if(i === 4) {
                                        setPiece(box, 'white', 'king');
                          }
                 } else if(j === 6) {
                          setPiece(box, 'white', 'pawn');
                 } else if(j === 1) {
                          setPiece(box, 'black', 'pawn');
                 } else if(j === 0) {
                          if(i === 0 || i === 7) {
                                        setPiece(box, 'black', 'rook');
                          } else if(i === 1 || i === 6) {
                                        setPiece(box, 'black', 'knight');
                          } else if(i === 2 || i === 5) {
                                        setPiece(box, 'black', 'bishop');
                          } else if(i === 3) {
                                        setPiece(box, 'black', 'queen');
                          } else if(i === 4) {
                                        setPiece(box, 'black', 'king');
                          }
                 }
        }
			//Switch player
        var switchPlayer = function() {
                 if(player === 'black') {
                          $('#player').html(chessPieces.white.king);
                          player = 'white';
                 } else {
                          $('#player').html(chessPieces.black.king);
                          player = 'black';
                 }
        }

        //Restart game
        var resetGame = function() {
                 deleteBox($('.box'));
                 $('#player').html(chessPieces.black.king);
                 $('#result').addClass('hide');
                 $('#option-menu').addClass('hide');
                 $('#game').css('opacity', '1');

                 //Set up color for boxes, chess pieces
                 for(var i = 0; i < 8; i++) {
                          for(var j = 0; j < 8; j++) {
                                        var box = $('#box-' + i + '-' + j);
                                        setNewBoard(box, i, j);
                          }
                 }

                 //Set global variables to default
                 player = 'white';
                 select = {
                          canMove: false,
                          piece: '',
                          box: ''
                 };

                 historyMoves = [];
                 promotion = {};
        }

        //Announce the winner
        var showWinner = function(winner) {

                 historyMoves = [];
                 promotion = {};
		
               
                 setTimeout(function() {
                          if(winner === 'DRAW') { //Game is draw
                                        $('#result').css('color', '#000');
                                        $('#result').html(winner);
                          } else { //There is a winner
                                        $('#result').css('color', winner + '');
                                        $('#result').html(chessPieces[winner].king + ' wins!');
                          }
                          $('#result').removeClass('hide');
                          $('#game').css('opacity', '0.5');
                 }, 1000);
        }
