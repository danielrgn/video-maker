const algorithmia = require("algorithmia");
const algorithmiaApiKey = require("../credentials/algorithmia.json").apiKey;
const sbd = require('sbd')

const watsonApiKey = require('../credentials/watson-nlu.json').apikey
const NaturalLanguageUnderstandingV1 = require('watson-developer-cloud/natural-language-understanding/v1.js')

const nlu = new NaturalLanguageUnderstandingV1({
    iam_apikey: watsonApiKey,
    version: '2018-04-05',
    url: 'https://gateway.watsonplatform.net/natural-language-understanding/api/'
})

const state = require('./state.js')

async function robot() {
    const content = state.load()

    await fetchContentFromWikipedia(content)
    sanitizeContent(content)
    breakContentIntoSentences(content)
    limitMaxSentences(content)
    await fetchKeywordsOfAllSentences(content)
    
    state.save(content);

    async function fetchContentFromWikipedia(content) {
        const algorithmiaAuthenticated = algorithmia(algorithmiaApiKey);
        const wikipediaAlgoritm = algorithmiaAuthenticated.algo(
          "web/WikipediaParser/0.1.2?timeout=300"
        );
        const wikipediaResponse = await wikipediaAlgoritm.pipe({
            "lang": content.lang,
            "articleName": content.searchTerm
        });
        const wikipediaContent = wikipediaResponse.get()
        
        content.sourceContentOriginal = wikipediaContent.content
    }

    function sanitizeContent(content) {
        const withoutBlankLinesAndMarkdown = removeBlankLinesAndMarkdown(
          content.sourceContentOriginal
        );
        const withoutDatesInParentheses = removeDatesInParentheses(withoutBlankLinesAndMarkdown)
        content.sourceContentSanitezed = withoutDatesInParentheses
        
        function removeBlankLinesAndMarkdown(text) {
          const allLines = text.split("\n");

          const withoutBlankLinesAndMarkdown = allLines.filter(
            line => line.trim() && !line.trim().startsWith('=')
          );

          return withoutBlankLinesAndMarkdown.join(' ');
        }
        function removeDatesInParentheses(text) {
          return text.replace(/\((?:\([^()]*\)|[^()])*\)/gm, "").replace("/  /g", " ");
        }
    }

    function breakContentIntoSentences(content) {
        content.sentences = []

        const sentences = sbd.sentences(content.sourceContentSanitezed)
        sentences.forEach(sentence => {
            content.sentences.push({
                text: sentence,
                keywords: [],
                images: []
            })
        })
    }

    function limitMaxSentences(content) {
        content.sentences = content.sentences.slice(0, content.maximumSentences)
    }

    async function fetchKeywordsOfAllSentences(content) {
        for (const sentence of content.sentences) {
            sentence.keywords = await fetchWatsonAndReturnKeywords(sentence.text)
        }
    }

    async function fetchWatsonAndReturnKeywords(sentece) {
        return new Promise((resolve, reject) => {
            nlu.analyze({
                text: sentece,
                features: {
                    keywords: {}
                }
            }, (error, response) => {
                if (error) {
                    throw error
                }

                const keywords = response.keywords.map(keyword => keyword.text)
                resolve(keywords)
            })
        })
        
    }
}

module.exports = robot;