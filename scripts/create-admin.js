#!/usr/bin/env node
'use strict';

/**
 * Production-safe admin creation. Prompts interactively (password is hidden)
 * or accepts CLI flags.
 *
 * Usage:
 *   node scripts/create-admin.js
 *   node scripts/create-admin.js --email foo@bar.com --password secret --name "Foo"
 */

require('dotenv').config();

const readline = require('readline');
const { AdminService } = require('../Services');

function parseArgs(argv) {
    const out = {};
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--email') out.email = argv[++i];
        else if (a === '--password') out.password = argv[++i];
        else if (a === '--name') out.name = argv[++i];
    }
    return out;
}

function prompt(question) {
    return new Promise(resolve => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); });
    });
}

function promptHidden(question) {
    // Reads stdin without echoing — password gets typed but not shown.
    return new Promise(resolve => {
        process.stdout.write(question);
        const stdin = process.stdin;
        const wasRaw = stdin.isRaw;
        if (stdin.setRawMode) stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');
        let buf = '';
        const onData = (ch) => {
            switch (ch) {
                case '\n':
                case '\r':
                case '':
                    if (stdin.setRawMode) stdin.setRawMode(wasRaw);
                    stdin.pause();
                    stdin.removeListener('data', onData);
                    process.stdout.write('\n');
                    resolve(buf);
                    break;
                case '':
                    process.exit(130);
                    break;
                case '':
                case '\b':
                    if (buf.length > 0) {
                        buf = buf.slice(0, -1);
                        process.stdout.write('\b \b');
                    }
                    break;
                default:
                    buf += ch;
                    process.stdout.write('*');
            }
        };
        stdin.on('data', onData);
    });
}

function emailValid(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function main() {
    const args = parseArgs(process.argv);

    let email = args.email;
    let password = args.password;
    let name = args.name;

    if (!email) email = await prompt('Email: ');
    if (!emailValid(email)) {
        console.error('Invalid email');
        process.exit(1);
    }

    if (!password) password = await promptHidden('Password (min 8 chars): ');
    if (!password || password.length < 8) {
        console.error('Password must be at least 8 characters');
        process.exit(1);
    }

    if (name === undefined) name = await prompt('Name (optional): ');

    try {
        const admin = await AdminService.createAdmin({ email, password, name });
        console.log('\n✓ Admin created');
        console.log('  email:    ', admin.email);
        console.log('  name:     ', admin.name || '(none)');
        console.log('  createdAt:', admin.createdAt);
    } catch (e) {
        console.error('\n✗ Failed:', e.message);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
