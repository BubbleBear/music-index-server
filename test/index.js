const fs = require('fs');

try {
    fs.mkdirSync('asdf', {
        recursive: true,
    });
} catch (e) {
    console.log(e);
}
