package main

import (
	"github.com/albrow/gopherjs-router"
	"github.com/gopherjs/jquery"
)

var jq = jquery.NewJQuery

func main() {
	print("Starting...")

	// Create a new router
	r := router.New()

	// Add some routes. For now, they
	// will just write messages to the console
	r.HandleFunc("/", func(id ...int) {
		print("At home page!")
		jq("#current-page").SetHtml("Home Page")
	})
	r.HandleFunc("/about", func(id ...int) {
		print("At about page!")
		jq("#current-page").SetHtml("About Page")
	})
	r.HandleFunc("/faq", func(id ...int) {
		print("At faq page!")
		jq("#current-page").SetHtml("FAQ Page")
	})
	r.HandleFunc("/post/:id", func(id ...int) {
		print("At Post Page for Post: ", id[0])
		jq("#current-page").SetHtml("Post Page")
	})

	r.Start()
}
