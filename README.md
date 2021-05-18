# Scraper

## Step1. Build site navigation map

Purpose: generate an array of listing pages

```output
{
  url: "https://...",
  id: a unique hash or truncated string of url e.g. 'author-abcde'
  createTs, lastScrapeTs

  // free form page context
  type: "detective", page: 3, author: 'xxx'...
   
}
```

## Step2. Constructe list of item lists

Item Type:

- Story
- Book
- Comic

```output
{
	url, id,
	createTs, lastScrapeTs
	isDone ?: true // if this book is finished then no more 
	name, type

	// free form 
	author, genre, language, 
	
	// resource
	coverUrl?: "https:///.....png",
	childPages: [
		{ id: "chapter-1-1", url: "https:////...html"}
		....
	]
}

```
