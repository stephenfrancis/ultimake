
const test = require("ava");
const Cp   = require("child_process");
const Fs   = require("fs");
const main = require("./main");


Cp.execSync("rm -f build/vars.json");


test("basedir", async t => {
  t.is(main.basedir("foo"), "", "basedir(foo)");
  t.is(main.basedir("foo/"), "foo", "basedir(foo/)");
  t.is(main.basedir("foo/bar.txt"), "foo", "basedir(foo/bar.txt)");
});


test("build vars file creation", async t => {
  t.is(main.getArgs().env, "dev", "env defaults to dev");
  t.throws(() => {
    main.createBuildVarsFile("build/temp.json");
  }, {
    message: "setBuildVarsFile() not called - required to define the Build Vars file location",
  });
  main.setBuildVarsFile("build/vars.json");
  t.throws(() => {
    main.getArgs();
  }, {
    message: "ENOENT: no such file or directory, open \'build/vars.json\'",
  });
  Fs.writeFileSync("build/temp.json", JSON.stringify({
    paramX: {
      prod: "X-prod",
      dev : "X-dev",
    }
  }), {
    encoding: "utf8",
  })
  main.createBuildVarsFile("build/temp.json");
  t.is(main.getArgs().paramX, "X-dev", "paramX set correctly");
  t.throws(() => {
    main.createBuildVarsFile("build/temp.json");
  }, {
    message: "getArgs() already called",
  });
});
