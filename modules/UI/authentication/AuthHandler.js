/* global APP, config, JitsiMeetJS, Promise */

import { openConnection } from '../../../connection';
import { setJWT } from '../../../react/features/base/jwt';
import { JitsiConnectionErrors } from '../../../react/features/base/lib-jitsi-meet';

import UIUtil from '../util/UIUtil';
import LoginDialog from './LoginDialog';

const logger = require('jitsi-meet-logger').getLogger(__filename);

let externalAuthWindow;
let authRequiredDialog;

const isTokenAuthEnabled
    = typeof config.tokenAuthUrl === 'string' && config.tokenAuthUrl.length;
const getTokenAuthUrl
    = JitsiMeetJS.util.AuthUtil.getTokenAuthUrl.bind(null, config.tokenAuthUrl);

/**
 * Authenticate using external service or just focus
 * external auth window if there is one already.
 *
 * @param {JitsiConference} room
 * @param {string} [lockPassword] password to use if the conference is locked
 */
function doExternalAuth(room, lockPassword) {
    if (externalAuthWindow) {
        externalAuthWindow.focus();

        return;
    }
    if (room.isJoined()) {
        let getUrl;

        if (isTokenAuthEnabled) {
            getUrl = Promise.resolve(getTokenAuthUrl(room.getName(), true));
            initJWTTokenListener(room);
        } else {
            getUrl = room.getExternalAuthUrl(true);
        }
        getUrl.then(url => {
            externalAuthWindow = LoginDialog.showExternalAuthDialog(
                url,
                () => {
                    externalAuthWindow = null;
                    if (!isTokenAuthEnabled) {
                        room.join(lockPassword);
                    }
                }
            );
        });
    } else if (isTokenAuthEnabled) {
        redirectToTokenAuthService(room.getName());
    } else {
        room.getExternalAuthUrl().then(UIUtil.redirect);
    }
}

/**
 * Redirect the user to the token authentication service for the login to be
 * performed. Once complete it is expected that the service wil bring the user
 * back with "?jwt={the JWT token}" query parameter added.
 * @param {string} [roomName] the name of the conference room.
 */
function redirectToTokenAuthService(roomName) {
    // FIXME: This method will not preserve the other URL params that were
    // originally passed.
    UIUtil.redirect(getTokenAuthUrl(roomName, false));
}

/**
 * Initializes 'message' listener that will wait for a JWT token to be received
 * from the token authentication service opened in a popup window.
 * @param room the name fo the conference room.
 */
function initJWTTokenListener(room) {
    /**
     *
     */
    function listener({ data, source }) {
        if (externalAuthWindow !== source) {
            logger.warn('Ignored message not coming '
                + 'from external authnetication window');

            return;
        }

        let jwt;

        if (data && (jwt = data.jwtToken)) {
            logger.info('Received JSON Web Token (JWT):', jwt);

            APP.store.dispatch(setJWT(jwt));

            const roomName = room.getName();

            openConnection({
                retry: false,
                roomName
            }).then(connection => {
                // Start new connection
                const newRoom = connection.initJitsiConference(
                    roomName, APP.conference._getConferenceOptions());

                // Authenticate from the new connection to get
                // the session-ID from the focus, which wil then be used
                // to upgrade current connection's user role

                newRoom.room.moderator.authenticate()
                .then(() => {
                    connection.disconnect();

                    // At this point we'll have session-ID stored in
                    // the settings. It wil be used in the call below
                    // to upgrade user's role
                    room.room.moderator.authenticate()
                        .then(() => {
                            logger.info('User role upgrade done !');
                            // eslint-disable-line no-use-before-define
                            unregister();
                        })
                        .catch((err, errCode) => {
                            logger.error('Authentication failed: ',
                                err, errCode);
                            unregister();
                        });
                })
                .catch((error, code) => {
                    unregister();
                    connection.disconnect();
                    logger.error(
                        'Authentication failed on the new connection',
                        error, code);
                });
            }, err => {
                unregister();
                logger.error('Failed to open new connection', err);
            });
        }
    }

    /**
     *
     */
    function unregister() {
        window.removeEventListener('message', listener);
    }

    if (window.addEventListener) {
        window.addEventListener('message', listener, false);
    }
}

/**
 * Authenticate on the server.
 * @param {JitsiConference} room
 * @param {string} [lockPassword] password to use if the conference is locked
 */
function doXmppAuth(room, lockPassword) {
    const loginDialog = LoginDialog.showAuthDialog(
        /* successCallback */ (id, password) => {
            room.authenticateAndUpgradeRole({
                id,
                password,
                roomPassword: lockPassword,

                /** Called when the XMPP login succeeds. */
                onLoginSuccessful() {
                    loginDialog.displayConnectionStatus('connection.FETCH_SESSION_ID');
                    APP.conference.setModerator(true);
                    APP.conference.setDoCap(true);
                }
            })
            .then(
                /* onFulfilled */ () => {
                    loginDialog.displayConnectionStatus(
                        'connection.GOT_SESSION_ID');
                    loginDialog.close();
                },
                /* onRejected */ error => {
                    logger.error('authenticateAndUpgradeRole failed', error);

                    const { authenticationError, connectionError } = error;

                    if (authenticationError) {
                        loginDialog.displayError(
                            'connection.GET_SESSION_ID_ERROR',
                            { msg: authenticationError });
                    } else if (connectionError) {
                        loginDialog.displayError(connectionError);
                    }
                });
        },
        /* cancelCallback */ () => loginDialog.close());
}

/**
 * Authenticate for the conference.
 * Uses external service for auth if conference supports that.
 * @param {JitsiConference} room
 * @param {string} [lockPassword] password to use if the conference is locked
 */
function authenticate(room, lockPassword) {
    if (isTokenAuthEnabled || room.isExternalAuthEnabled()) {
        doExternalAuth(room, lockPassword);
    } else {
        // const lav = document.querySelector('#largeVideo');
        const lov = document.querySelector('#localVideo_container');

        // if (lav.duration > 0 && !lav.paused) {
            // snap(room, lockPassword, null, lav);
        //}
        if (lov.duration > 0 && !lov.paused) {
            const spanImHost = document.querySelector('[data\\-i18n=dialog\\.IamHost]');
            spanImHost.innerHTML = 'Verificando biometria facial, aguarde...';
            snap(room, lockPassword, null, lov);
        } 

        // doXmppAuth(room, lockPassword);
    }
}

/**
 * De-authenticate local user.
 *
 * @param {JitsiConference} room
 * @param {string} [lockPassword] password to use if the conference is locked
 * @returns {Promise}
 */
function logout(room) {
    return new Promise(resolve => {
        room.room.moderator.logout(resolve);
    }).then(url => {
        // de-authenticate conference on the fly
        if (room.isJoined()) {
            room.join();
        }

        return url;
    });
}

/**
 * Notify user that authentication is required to create the conference.
 * @param {JitsiConference} room
 * @param {string} [lockPassword] password to use if the conference is locked
 */
function requireAuth(room, lockPassword) {
    if (authRequiredDialog) {
        return;
    }

    authRequiredDialog = LoginDialog.showAuthRequiredDialog(
        room.getName(), authenticate.bind(null, room, lockPassword)
    );
}

/**
 * Close auth-related dialogs if there are any.
 */
function closeAuth() {
    if (externalAuthWindow) {
        externalAuthWindow.close();
        externalAuthWindow = null;
    }

    if (authRequiredDialog) {
        authRequiredDialog.close();
        authRequiredDialog = null;
    }
}

/**
 *
 */
function showXmppPasswordPrompt(roomName, connect) {
    return new Promise((resolve, reject) => {
        const authDialog = LoginDialog.showAuthDialog(
            (id, password) => {
                connect(id, password, roomName).then(connection => {
                    authDialog.close();
                    resolve(connection);
                }, err => {
                    if (err === JitsiConnectionErrors.PASSWORD_REQUIRED) {
                        authDialog.displayError(err);
                    } else {
                        authDialog.close();
                        reject(err);
                    }
                });
            }
        );
    });
}

/**
 * Show Authentication Dialog and try to connect with new credentials.
 * If failed to connect because of PASSWORD_REQUIRED error
 * then ask for password again.
 * @param {string} [roomName] name of the conference room
 * @param {function(id, password, roomName)} [connect] function that returns
 * a Promise which resolves with JitsiConnection or fails with one of
 * JitsiConnectionErrors.
 * @returns {Promise<JitsiConnection>}
 */
function requestAuth(roomName, connect) {
    if (isTokenAuthEnabled) {
        // This Promise never resolves as user gets redirected to another URL
        return new Promise(() => redirectToTokenAuthService(roomName));
    }

    return showXmppPasswordPrompt(roomName, connect);

}

function snap(room, lockPassword, loginDialog, video) {    
    try {
        // Image frame size
        const scaled = calculateImage(
            APP.conference.getInterfaceConfig().UNIKE_WIDTH,
            APP.conference.getInterfaceConfig().UNIKE_HEIGHT,
            APP.conference.getInterfaceConfig().UNIKE_MAX_WIDTH,
            APP.conference.getInterfaceConfig().UNIKE_MAX_HEIGHT
        );

        // Canvas for image video
        const canvas = document.createElement('canvas');
        canvas.id = 'canvas_';
        canvas.width  = scaled.width;
        canvas.height = scaled.height;

        // Set canvas on document
        document.body.appendChild(canvas);

        // Context object for working with the canvas
        const context = canvas.getContext('2d');

        // Get the exact size of the video element
        const width = canvas.width;
        const height = canvas.height;

        // Draw a copy of the current frame from the video on the canvas
        context.drawImage(video, 0, 0, width, height);

        // Create new image
        postAccess(room, lockPassword, loginDialog, canvas.toDataURL('image/png'));
    } catch(err) {
        logger.info(`ukid -> draw image not possible - dn: ${err.toString()}`)
    }
}

function calculateImage(sw, sh, mw, mh) {
    var ratio = [mw / sw, mh / sh];
    ratio = Math.min(ratio[0], ratio[1]);
    return {
        width: sw * ratio,
        height: sh * ratio
    };
}

// Send small image to a server of your choice
function postAccess(room, lockPassword, loginDialog, base64) {
    const createRequest = function(method, url, tk) {
        var request = new XMLHttpRequest();
        request.open(method, url, true);
        request.setRequestHeader("Content-Type", "application/json");
        request.setRequestHeader("Authorization", "Bearer " + tk);
        return request;
    };
    
    const xhr = createRequest("post", APP.conference.getInterfaceConfig().UNIKE_ENDPOINT + APP.conference.getInterfaceConfig().UNIKE_MODERATOR_INTEGRATION, APP.conference.getInterfaceConfig().UNIKE_TOKEN);
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            const spanImHost = document.querySelector('[data\\-i18n=dialog\\.IamHost]');
            if (xhr.status !== 200 && xhr.status !== 204) {
                spanImHost.innerHTML = 'Validação facial falhou!';
                setTimeout(function(){
                    closeAuth();
                    logout(room);
                    requireAuth(room, lockPassword);
                }, 2000)
            } else if (xhr.status === 200) {
                spanImHost.innerHTML = APP.translation.generateTranslationHTML('dialog.IamHost');
                closeAuth();
                logout(room);
                doXmppAuth(room, lockPassword);
            }
        }
    };

    xhr.send(
        JSON.stringify(
            {
                "documentNumber": APP.conference.roomName,
                "photo": base64.replace('data:image/png;base64,', '')
            }
        )
    );
}

export default {
    authenticate,
    requireAuth,
    requestAuth,
    closeAuth,
    logout
};

