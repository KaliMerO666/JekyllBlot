var resaveEntries = require("entries").resave;
var build = require("build");
var Blog = require("models/blog");
var Entries = require("models/entries");
var Entry = require("models/entry");
var _ = require("lodash");
var basename = require("path").basename;

var dictionary = {
  permalink: "Saved changes to your link format",
  forceSSL: "Saved SSL redirect setting",
  roundAvatar: "Saved photo settings",
  avatar: "Saved changes to your photo",
  menu: "Saved changes to your links",
  handle: "Saved changes to your subdomain on Blot",
  timeZone: "Saved changes to your time zone",
  dateFormat: "Saved changes to the order in which you write your dates",
};

module.exports = function (req, res, next) {
  var updates = req.updates || {};
  var redirect = req.body.redirect || req.path;

  Blog.set(req.blog.id, updates, function (errors, changes) {
    if (errors)
      for (var i in errors)
        if (errors[i] instanceof Error) return next(errors[i]);

    if (errors) return next(errors);

    // We now need to save every entry so that
    // changes to permalink format take effect.
    if (changes.indexOf("timeZone") > -1 || changes.indexOf("permalink") > -1) {
      resaveEntries(req.blog.id, function () {});
    }

    // We need to build all the blog's entries if the user
    // has changed any of the plugins or their permalink
    // format. This should be improved but we.
    if (changes && changes.indexOf("plugins") > -1) {
      Blog.get({ id: req.blog.id }, function (err, blog) {
        Entries.each(
          req.blog.id,
          function (entry, next) {
            if (!entry) {
              console.warn("No entry exists with path", entry.path);
              return next();
            }

            // Otherwise this would make the entry visible...
            if (entry.deleted) return next();

            let options = {};

            if (entry.pathDisplay) {
              options.pathDisplay = entry.pathDisplay;
              options.name = basename(entry.pathDisplay);
            }

            build(blog, entry.path, options, function (err, updatedEntry) {
              if (err && err.code === "ENOENT") {
                console.warn("No local file exists for entry", entry.path);
                return next();
              }

              // don't know
              if (err) {
                console.log("-----> REBUILD ERROR");
                console.log(err);
                if (err.stack) console.log(err.stack);
                if (err.trace) console.log(err.trace);
                return next();
              }

              Entry.set(blog.id, updatedEntry.path, updatedEntry, next);
            });
          },
          function () {
            console.log("Rebuilt blog");
          }
        );
      });
    }

    // Add success message if we're going to the settings page
    // and successful changes were made
    if (changes && changes.length && _.isEmpty(errors)) {

      if (changes.indexOf('handle') > -1)
        redirect = `/dashboard/${updates.handle}/domain`;

      return res.message(
        redirect,
        dictionary[changes[0]] || "Saved changes to your " + changes[0]
      );
    }

    return res.redirect(redirect);
  });
};
