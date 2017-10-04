var axios = require('axios');
var querystring = require('querystring');

axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
axios.defaults.headers.common['Content-Type'] = 'application/json';

var redirect = "http://localhost:3000/oauth.html";

var Spotify = function () {

    this.intent = [
        // TODO: Find and remove please before and after input before passing it to the trigger matcher.
        {value: "[please] play [(the|my)] music [please]", trigger: "spotify.play"},
        {value: "[please] turn [(the|my)] music on [please]", trigger: "spotify.play"},
        {value: "[please] turn on [(the|my)] music [please]", trigger: "spotify.play"},
        {value: "[please] play [the] ((artist|band) *artist|(album|cd|disk|record|single) *album [(from|by) [[the] (artist|band)] *artist]) [on spotify] [please]", trigger: "spotify.play"},
        {value: "[please] play [[the] (song|track)] *song [by [the (artist|band)] *artist] [(from|on) the (album|cd|disk|record|single) *album] [on spotify] [please]", trigger: "spotify.play"},
        {value: "[please] (turn off|stop [playing]) [(the|my)] music [please]", trigger: "spotify.pause"},
        {value: "[please] turn [(the|my)] music off [please]", trigger: "spotify.pause"},
        {value: "[please] pause [(the|my)] music [please]", trigger: "spotify.pause"},
        {value: "[please] [play [the]] last song [again] [please]", trigger: "spotify.previous"},
        {value: "[please] [play [the]] next song [please]", trigger: "spotify.next"}
    ];

    // TODO: "Save this song", "Set Volume", "Play playlist", "Add this song to playlist", "Play songs like this"

    this.triggers = {
        play: function (dfd, expression, getMemory, setMemory, getExamples, data) {
            var song = data.namedValues.song;
            var artist = data.namedValues.artist;
            var album = data.namedValues.album;

            Spotify.play(song, album, artist, getMemory, setMemory, function (response) {
                dfd.resolve(response);
            });
        },
        pause: function (dfd, expression, getMemory, setMemory) {
            Spotify.sendCmd(Spotify.commands.PAUSE, null, getMemory, setMemory, function (response) {
                dfd.resolve(response);
            });
        },
        next: function (dfd, expression, getMemory, setMemory) {
            Spotify.sendCmd(Spotify.commands.NEXT, null, getMemory, setMemory, function (response) {
                dfd.resolve(response);
            });
        },
        previous: function (dfd, expression, getMemory, setMemory) {
            Spotify.sendCmd(Spotify.commands.PREV, null, getMemory, setMemory, function (response) {
                dfd.resolve(response);
            });
        }
    };

    this.context = {};

    var redirectUrl = encodeURIComponent(redirect);

    // TODO: Add back in config so that if a plugin option is set in the config file, it is not shown to the user as an option that can be configured.
    // TODO: Add callbacks for when plugin options are set. In this case, when the user authenticates with Spotify, we need to log in and get the refresh token before the auth token expires.
    this.options = {
        clientId: {name: "Client ID", description: "Your Spotify application Client ID found at https://developer.spotify.com/my-applications/#!/applications"},
        clientSecret: {name: "Client Secret", description: "Your Spotify application Client Secret found at https://developer.spotify.com/my-applications/#!/applications"},
        authCode: {
            name: "Auth Code",
            description: "",
            oauth: {
                url: "https://accounts.spotify.com/authorize?client_id={{plugin.options['spotify.clientId'].value}}&response_type=code&redirect_uri=" + redirectUrl + "&scope=playlist-read-private%20playlist-read-collaborative%20user-read-playback-state%20user-modify-playback-state%20user-read-private",
                urlParam: "code"
            }
        }
    };
};

Spotify.play = function (song, album, artist, getMemory, setMemory, callback) {
    Spotify.getToken(getMemory, setMemory, function (err, token) {
        if (err) {
            console.log(JSON.stringify(err.response.data));
            callback("Sorry, something went wrong. Please make sure your Spotify plugin is set up correctly.");
            return;
        }

        var play = function (data, song, album, artist) {
            axios.put("https://api.spotify.com/v1/me/player/play", data, {
                headers: {'Authorization': 'Bearer ' + token}
            }).then(function () {
                if (song && artist) {
                    callback("Playing " + song + " by " + artist + " on Spotify.");
                } else if (album && artist) {
                    callback("Playing " + album + " by " + artist + " on Spotify.");
                } else if (artist) {
                    callback("Playing " + artist + " on Spotify.");
                } else {
                    callback();
                }
            }).catch(function (err) {
                console.log(err.message);
                console.log(JSON.stringify(err.response.data));
                callback("Sorry, something went wrong. Please make sure your Spotify plugin is set up correctly.");
            });
        };

        if (song || album || artist) {

            var queryParts = [];
            var type = "track";

            if (song) {
                type = "track";
                if (album) {
                    queryParts.push("album:" + album);
                }
                if (artist) {
                    queryParts.push("artist:" + artist);
                }
                if (song) {
                    queryParts.push("track:" + song);
                }

            } else if (album) {
                type = "album";
                if (album) {
                    queryParts.push("album:" + album);
                }
                if (artist) {
                    queryParts.push("artist:" + artist);
                }
                if (song) {
                    queryParts.push("track:" + song);
                }

            } else if (artist) {
                type = "artist";
                if (album) {
                    queryParts.push("album:" + album);
                }
                if (artist) {
                    queryParts.push("artist:" + artist);
                }
                if (song) {
                    queryParts.push("track:" + song);
                }
            }

            var query = encodeURIComponent(queryParts.join(" "));

            axios.get("https://api.spotify.com/v1/search?q=" + query + "&type=" + type + "&market=from_token&limit=1", {
                headers: {'Authorization': 'Bearer ' + token}
            }).then(function (response) {
                if (response.data) {
                    var data;
                    var song;
                    var artist;
                    var album;

                    if (type === "track" && response.data.tracks && response.data.tracks.items.length > 0) {
                        data = {uris: [response.data.tracks.items[0].uri]};
                        song = response.data.tracks.items[0].name;
                        artist = response.data.tracks.items[0].artists[0].name;
                    } else if (type === "album" && response.data.albums && response.data.albums.items.length > 0) {
                        data = {context_uri: response.data.albums.items[0].uri};
                        artist = response.data.albums.items[0].artists[0].name;
                        album = response.data.albums.items[0].name;
                    } else if (type === "artist" && response.data.artists && response.data.artists.items.length > 0) {
                        data = {context_uri: response.data.artists.items[0].uri};
                        artist = response.data.artists.items[0].name;
                    }

                    play(data, song, album, artist);
                }
            }).catch(function (err) {
                console.log(err.message);
                console.log(JSON.stringify(err.response.data));
                callback("Sorry, something went wrong. Please make sure your Spotify plugin is set up correctly.");
            });
        } else {
            play(null);
        }

    });
};

Spotify.sendCmd = function (commandCode, data, getMemory, setMemory, callback) {
    Spotify.getToken(getMemory, setMemory, function (err, token) {

        if (err) {
            console.log(err.message);
            console.log(JSON.stringify(err.response.data));
            callback("Sorry, something went wrong. Please make sure your Spotify plugin is set up correctly.");
            return;
        }

        var handleError = function (err) {
            console.log(err.message);
            console.log(JSON.stringify(err.response.data));
            callback("Sorry, something went wrong. Please make sure your Spotify plugin is set up correctly.");
        };

        switch (commandCode) {
        case Spotify.commands.NEXT:
            axios.post("https://api.spotify.com/v1/me/player/next", null, {
                headers: {'Authorization': 'Bearer ' + token}
            }).catch(handleError);
            break;
        case Spotify.commands.PREV:
            axios.post("https://api.spotify.com/v1/me/player/previous", null, {
                headers: {'Authorization': 'Bearer ' + token}
            }).catch(handleError);
            break;
        case Spotify.commands.PLAY:
            axios.put("https://api.spotify.com/v1/me/player/play", data, {
                headers: {'Authorization': 'Bearer ' + token}
            }).catch(handleError);
            break;
        case Spotify.commands.PAUSE:
            axios.put("https://api.spotify.com/v1/me/player/pause", null, {
                headers: {'Authorization': 'Bearer ' + token}
            }).catch(handleError);
            break;
        }

    });
};

Spotify.getTokenFromAuth = function (clientId, clientSecret, authCode) {

    var data = querystring.stringify({
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: redirect,
        client_id: clientId,
        client_secret: clientSecret
    });

    return axios.post("https://accounts.spotify.com/api/token", data, {
        headers: {
            'Content-Type':'application/x-www-form-urlencoded'
        }
    }).then(function (response) {
        return {token: response.data.access_token, refreshToken: response.data.refresh_token};
    }).catch(function (error) {
        throw error;
    });
};

Spotify.getTokenFromRefresh = function (clientId, clientSecret, refreshToken) {

    var data = querystring.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret
    });

    return axios.post("https://accounts.spotify.com/api/token", data, {
        headers: {
            'Content-Type':'application/x-www-form-urlencoded'
        }
    }).then(function (response) {
        return {token: response.data.access_token, refreshToken: response.data.refresh_token};
    }).catch(function (error) {
        throw error;
    });
};

Spotify.getToken = function (getMemory, setMemory, callback) {
    var clientId = getMemory("clientId");
    var clientSecret = getMemory("clientSecret");
    var authCode = getMemory("authCode");
    var refreshToken = getMemory("refreshToken");

    if (refreshToken) {
        Spotify.getTokenFromRefresh(clientId, clientSecret, refreshToken).then(function (response) {
            if (response.refreshToken) {
                setMemory("refreshToken", response.refreshToken);
                setMemory("authCode", null);
            }
            callback(null, response.token);
        }, function (err) {
            callback(err);
        });
    } else {
        Spotify.getTokenFromAuth(clientId, clientSecret, authCode).then(function (response) {
            if (response.refreshToken) {
                setMemory("refreshToken", response.refreshToken);
                setMemory("authCode", null);
            }
            callback(null, response.token);
        }, function (err) {
            callback(err);
        });
    }
};

Spotify.commands = {
    NEXT: 'NEXT',
    PREV: 'PREV',
    PLAY: 'PLAY',
    PAUSE: 'PAUSE'
};

module.exports = {
    namespace: 'spotify',
    examples: [
        "Play Stairway to Heaven by Led Zeppelin on Spotify",
        "Play the next song",
        "Pause the music",
        "Play the artist Oh Wonder",
        "Play the album The Wall by Pink Floyd on Spotify"
    ],
    register: function () {
        return new Spotify();
    }
};