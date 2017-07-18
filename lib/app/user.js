﻿/*

This file is part of Streembit application. 
Streembit is an open source communication application. 

Streembit is a free software: you can redistribute it and/or modify it under the terms of the GNU General Public License 
as published by the Free Software Foundation, either version 3.0 of the License, or (at your option) any later version.

Streembit is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty 
of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with Streembit software.  
If not, see http://www.gnu.org/licenses/.
 
-------------------------------------------------------------------------------------------------------------------------
Author: Tibor Zsolt Pardi 
Copyright (C) Streembit 2017
-------------------------------------------------------------------------------------------------------------------------

*/

'use strict';

var ecckey = require('cryptlib');
var secrand = require('secure-random');
var createHash = require('create-hash');
var logger = require('./logger');
var peermsg = require("peermsg");
var database = require('./database');
var events = require("appevents");
var appsrvc = require('./appsrvc');
var accounts = require('./accounts');
var Buffer = require('buffer').Buffer;


(function () {
    var usrobj = {};

    var m_name = null;
    var key = null;
    var m_port = null;
    var m_address = null;
    var m_salt = null;
    var m_password = null;
    var m_connsymmkey = null;
    var m_pkbdf2_password_hash = null;
    var m_certificate = null;
    var m_cert_encrypted_privkey = null;
    var m_email = null;

    Object.defineProperty(usrobj, "email", {
        get: function () {
            return m_email;
        },

        set: function (value) {
            m_email = value;
        }
    });

    Object.defineProperty(usrobj, "cert_encrypted_privkey", {
        get: function () {
            return m_cert_encrypted_privkey;
        },

        set: function (value) {
            m_cert_encrypted_privkey = value;
        }
    });

    Object.defineProperty(usrobj, "certificate", {
        get: function () {
            return m_certificate;
        },

        set: function (value) {
            m_certificate = value;
        }
    });

    Object.defineProperty(usrobj, "pkbdf2_password_hash", {
        get: function () {
            return m_pkbdf2_password_hash;
        },

        set: function (value) {
            m_pkbdf2_password_hash = value;
        }
    });

    Object.defineProperty(usrobj, "connsymmkey", {
        get: function () {
            return m_connsymmkey;
        },

        set: function (value) {
            m_connsymmkey = value;
        }
    });

    Object.defineProperty(usrobj, "salt", {
        get: function () {
            return m_salt;
        },

        set: function (value) {
            m_salt = value;
        }
    });

    Object.defineProperty(usrobj, "password", {
        get: function () {
            return m_password;
        },

        set: function (value) {
            m_password = value;
        }
    });

    Object.defineProperty(usrobj, "name", {
        get: function () {
            return m_name;
        },

        set: function (value) {
            m_name = value;
        }
    });

    Object.defineProperty(usrobj, "port", {
        get: function () {
            return m_port;
        },

        set: function (value) {
            m_port = value;
        }
    });

    Object.defineProperty(usrobj, "address", {
        get: function () {
            return m_address;
        },

        set: function (value) {
            m_address = value;
        }
    });

    Object.defineProperty(usrobj, "crypto_key", {
        get: function () {
            return key;
        },

        set: function (value) {
            key = value;
        }
    });

    Object.defineProperty(usrobj, "private_key", {
        get: function () {
            return key ? key.privateKey : '';
        }
    });

    Object.defineProperty(usrobj, "public_key", {
        get: function () {
            return key ? key.publicKeyHex : '';
        }
    });

    Object.defineProperty(usrobj, "is_user_initialized", {
        get: function () {
            var isuser = m_name && key && ecdhkey;
            return isuser ? true : false;
        }
    });

    function getCryptPassword(password, salt, callback) {
        var saltbuffer = new Buffer(salt);
        var pwdbuffer = new Buffer(password);

        window.crypto.subtle.importKey(
            'raw',
            pwdbuffer,
            { name: 'PBKDF2' },
            false,
            ['deriveBits', 'deriveKey']
        ).then(function (impkey) {
            return window.crypto.subtle.deriveKey(
                {
                    "name": "PBKDF2",
                    salt: saltbuffer, //window.crypto.getRandomValues(new Uint8Array(16)),
                    iterations: 1000,
                    hash: { name: "SHA-512" }, //can be "SHA-1", "SHA-256", "SHA-384", or "SHA-512"
                },
                impkey, //your key from generateKey or importKey
                { //the key type you want to create based on the derived bits
                    name: "AES-CTR", //can be any AES algorithm ("AES-CTR", "AES-CBC", "AES-CMAC", "AES-GCM", "AES-CFB", "AES-KW", "ECDH", "DH", or "HMAC")
                    //the generateKey parameters for that type of algorithm
                    length: 256, //can be  128, 192, or 256
                },
                true, //whether the derived key is extractable (i.e. can be used in exportKey)
                ["encrypt", "decrypt"] //limited to the options in that algorithm's importKey
            );

        }).then(function (key) {
            // export the key
            return crypto.subtle.exportKey("raw", key);
        }).then(function (buffer) {
            //returns the derived key
            var pkbdf2hash = new Buffer(buffer).toString("hex");
            callback(null, pkbdf2hash);
            //
        })
        .catch(function (err) {
            callback(err);
        });
    }

    function addToDB(account, publickey, salt, certificate, encrprivkey, email, cipher_context, callback) {
        var user = {
            "account": account,
            "public_key": publickey,
            "cipher": cipher_context,
            "salt": salt,
            "certificate": certificate || '',
            "cert_encrypted_privkey": encrprivkey || '',
            "email": email || ''
        };

        accounts.update(user, function (err) {
            if (err) {
                return callback("Database update error " + err.message);
            }

            logger.debug("Account was added to database");

            if (callback) {
                callback();
            }
        });
    }

    usrobj.save_account = function (account, certificate, encrprivkey, email, callback) {
        var user_context = {
            "privatekey": usrobj.crypto_key.privateKeyHex,
            "connsymmkey": usrobj.connsymmkey,
            "timestamp": Date.now()
        };

        var cipher_context = peermsg.aes256encrypt(usrobj.pkbdf2_password_hash, JSON.stringify(user_context));

        var publicKey = usrobj.crypto_key.publicKeyHex;

        addToDB(account, publicKey, usrobj.salt, certificate, encrprivkey, email, cipher_context, function (err) {
            if (err) {
                return callback(err);
            }

            usrobj.name = account;
            usrobj.cert_encrypted_privkey = encrprivkey;
            usrobj.certificate = certificate;
            usrobj.email = email;

            appsrvc.email = email;
            appsrvc.username = account;
            appsrvc.userecckey = key;
            appsrvc.connsymmkey = user_context.connsymmkey

            streembit.ui.set_account_title(account);

            callback();
        });
    };

    usrobj.create_key = function (password, callback) {
        try {

            if (!password)
                throw new Error("create_account invalid parameters");

            var salt = secrand.randomBuffer(32).toString("hex");
            var saltbuffer = new Buffer(salt);
            var pwdbuffer = new Buffer(password);

            window.crypto.subtle.importKey(
                'raw',
                pwdbuffer,
                { name: 'PBKDF2' },
                false,
                ['deriveBits', 'deriveKey']
            ).then(function (impkey) {
                return window.crypto.subtle.deriveKey(
                    {
                        "name": "PBKDF2",
                        salt: saltbuffer, //window.crypto.getRandomValues(new Uint8Array(16)),
                        iterations: 1000,
                        hash: { name: "SHA-512" }, //can be "SHA-1", "SHA-256", "SHA-384", or "SHA-512"
                    },
                    impkey, //your key from generateKey or importKey
                    { //the key type you want to create based on the derived bits
                        name: "AES-CTR", //can be any AES algorithm ("AES-CTR", "AES-CBC", "AES-CMAC", "AES-GCM", "AES-CFB", "AES-KW", "ECDH", "DH", or "HMAC")
                        //the generateKey parameters for that type of algorithm
                        length: 256, //can be  128, 192, or 256
                    },
                    true, //whether the derived key is extractable (i.e. can be used in exportKey)
                    ["encrypt", "decrypt"] //limited to the options in that algorithm's importKey
                );

            }).then(function (key) {
                // export the key
                return crypto.subtle.exportKey("raw", key);
            }).then(function (buffer) {
                //returns the derived key
                var rndstr = secrand.randomBuffer(32).toString("hex");
                var entropy = createHash("sha256").update(rndstr).digest("hex");

                // create ECC key
                var key = new ecckey();
                key.generateKey(entropy);

                //  connection symmkey this
                var skrnd = secrand.randomBuffer(32).toString("hex");
                var skhash = createHash("sha256").update(skrnd).digest("hex");

                var pkbdf2hash = new Buffer(buffer).toString("hex");

                var skrnd2 = secrand.randomBuffer(32).toString("hex");
                var skhash2 = createHash("sha256").update(skrnd).digest("hex");                

                usrobj.connsymmkey = skhash;
                usrobj.crypto_key = key;
                usrobj.password = password;
                usrobj.salt = salt;
                usrobj.pkbdf2_password_hash = pkbdf2hash;
                usrobj.datacryptkey = skhash2;

                callback();
                //
            })
            .catch(function (err) {
                callback(err);
            });

        }
        catch (err) {
            logger.error("create_key error %j", err);
            callback(err);
        }
    };
    

    usrobj.initialize = function (user, password, cb) {
        try {
            if (!user || !password) {
                streembit.notify.error("Invalid parameters, the account and passwords are required");
                return false;
            }

            var account_name = user.account;
            if (!account_name) {
                streembit.notify.error("Invalid account name");
                return false;
            }

            // get the salt
            var salt = user.salt;

            getCryptPassword(password, salt, function (err, pkbdf2hash) {
                if (err) {
                    return cb(err);
                }

                // decrypt the cipher
                var plain_text;
                try {
                    plain_text = peermsg.aes256decrypt(pkbdf2hash, user.cipher);
                }
                catch (err) {
                    if (err.message && err.message.indexOf("decrypt") > -1) {
                        cb("Account initialize error, most likely an incorrect password was entered");
                    }
                    else {
                        cb( err);
                    }
                    return;
                }

                var userobj;
                try {
                    userobj = JSON.parse(plain_text);
                    if (!userobj || !userobj.privatekey || !userobj.timestamp || !userobj.connsymmkey) {
                        return cb("invalid password or invalid user object stored");
                    }
                }
                catch (e) {
                    return cb("Account initialize error. Select a saved account and enter the valid password. The encrypted account information must exists on the computer.");
                }

                var hexPrivatekey = userobj.privatekey;

                // create ECC key
                var key = new ecckey();
                key.keyFromPrivate(hexPrivatekey, 'hex');

                if (key.publicKeyHex != user.public_key) {
                    streembit.notify.error("Error in initializing the account, most likely an incorrect password");
                    return false;
                }

                //  connection symmkey this
                var skrnd = secrand.randomBuffer(32).toString("hex");
                var skhash = createHash("sha256").update(skrnd).digest("hex");
                usrobj.connsymmkey = skhash;

                usrobj.crypto_key = key;
                usrobj.name = account_name;               
                usrobj.password = password;
                usrobj.salt = salt;
                usrobj.pkbdf2_password_hash = pkbdf2hash;
                usrobj.email = user.email;

                if (!userobj.datacryptkey) {
                    // the data encryption key does not exists, create one
                    var skrnd2 = secrand.randomBuffer(32).toString("hex");
                    var skhash2 = createHash("sha256").update(skrnd).digest("hex");
                    userobj.datacryptkey = skhash2;
                }

                var user_context = {
                    "privatekey": usrobj.crypto_key.privateKeyHex,
                    "connsymmkey": usrobj.connsymmkey,
                    "datacryptkey": userobj.datacryptkey,
                    "timestamp": Date.now()
                };

                var cipher_context = peermsg.aes256encrypt(usrobj.pkbdf2_password_hash, JSON.stringify(user_context));

                var publicKey = usrobj.crypto_key.publicKeyHex;
                var encrprivkey = user.cert_encrypted_privkey
                var certificate = user.certificate;

                addToDB(account_name, publicKey, usrobj.salt, certificate, encrprivkey, user.email, cipher_context, function () {
                    if (err) {
                        return cb(err);
                    }

                    usrobj.cert_encrypted_privkey = encrprivkey;
                    usrobj.certificate = certificate;

                    appsrvc.email = user.email;
                    appsrvc.username = account_name;
                    appsrvc.connsymmkey = userobj.connsymmkey;
                    appsrvc.userecckey = key;
                    appsrvc.datacryptkey = userobj.datacryptkey;

                    streembit.ui.set_account_title(account_name);

                    cb();

                    logger.info("public key hex: %s", appsrvc.publickeyhex);
                    logger.info("public key hash: %s", appsrvc.pubkeyhash);
                    logger.info("public key BS58: %s", appsrvc.publicKeyBs58);
                });

            });

        }
        catch (err) {
            cb("Account initialize error. Select a saved account and enter the valid password.");
        }
    };

    usrobj.restore = function (password, user, callback) {
        try {
            if (!user || !user.account) {
                throw new Error("invalid user data");
            }

            var account = user.account;
            var salt = user.salt;

            var pbkdf2 = getCryptPassword(password, account);

            // decrypt the cipher
            var plain_text;
            try {
                plain_text = peermsg.aes256decrypt(pbkdf2, user.cipher);
            }
            catch (err) {
                if (err.message && err.message.indexOf("decrypt") > -1) {
                    streembit.notify.error("Account initialize error, most likely an incorrect password was entered");
                }
                else {
                    streembit.notify.error("Account initialize error: %j", err);
                }
                return false;
            }

            var userobj;
            try {
                userobj = JSON.parse(plain_text);
                if (!userobj || !userobj.privatekey || !userobj.timestamp) {
                    throw new Error("invalid password");
                }
            }
            catch (e) {
                streembit.notify.error("Account initialize error. Select a saved account and enter the valid password.");
                return false;
            }

            var hexPrivatekey = userobj.privatekey;

            // create ECC key
            var key = new ecckey();
            key.keyFromPrivate(hexPrivatekey, 'hex');
            if (key.publicKeyHex != user.public_key) {
                streembit.notify.error("Error in restoring the account, incorrect password or invalid backup data");
                return false;
            }
            
            if (!userobj.connsymmkey) {
                streembit.notify.error("Error in restoring the account, incorrect connection key in backup data");
                return false;
            }

            //  encrypt this
            var user_context = {
                "privatekey": key.privateKeyHex,
                "connsymmkey": userobj.connsymmkey,
                "timestamp": Date.now()
            };

            var cipher_context = peermsg.aes256encrypt(pbkdf2, JSON.stringify(user_context));

            var publicKey = key.publicKeyHex;

            addToDB(account, publicKey, salt, cipher_context, function () {
                usrobj.crypto_key = key;
                usrobj.name = account;

                appsrvc.username = account;
                appsrvc.userecckey = key;
                appsrvc.connsymmkey = userobj.connsymmkey;

                streembit.ui.set_account_title(account);
                streembit.notify.success("The account has been restored and initialized. You can connect to the City of Osmio P2P network");

                if (callback) {
                    callback();
                }
            });
        }
        catch (e) {
            streembit.notify.error("Account restore error: %j", e);
        }
    };

    usrobj.change_password = function (user, password, callback) {
        try {
            if (!user || !password) {
                streembit.notify.error("Invalid parameters, the account and passwords are required");
                return false;
            }

            var account = user.account;
            if (!account) {
                streembit.notify.error("Invalid account name");
                return false;
            }

            if (usrobj.name != account) {
                streembit.notify.error("Account " + account + " is not initialized");
                return false;
            }

            var publicKey = appsrvc.publickeyhex;
            if (publicKey != user.public_key) {
                streembit.notify.error("Account " + account + " is not initialized");
                return false;
            }

            if (!appsrvc.privateKeyHex || !appsrvc.connsymmkey) {
                streembit.notify.error("the existing crypto key is invalid");
                return false;
            }

            // create a new salt for this changed password
            var salt = secrand.randomBuffer(32).toString("hex");

            var symcrypt_key = getCryptPassword(password, account);
            var user_context = {
                "privatekey": appsrvc.privateKeyHex,
                "connsymmkey": appsrvc.connsymmkey,
                "timestamp": Date.now()
            };

            var cipher_context = peermsg.aes256encrypt(symcrypt_key, JSON.stringify(user_context));
            addToDB(account, user.public_key, salt, cipher_context, function () {
                callback();
            });
        }
        catch (err) {
            callback(err);
        }
    };

    usrobj.clear = function () {
        usrobj.crypto_key = null;
        usrobj.name = null;
    }

    module.exports = usrobj;

}());
