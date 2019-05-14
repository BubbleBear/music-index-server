import mongo from "mongodb";

const client = mongo.connect('mongodb://localhost:27017', {
    useNewUrlParser: true,
});

export default client;
