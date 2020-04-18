
# Errors and Validations

A key goal of Ultimake is to be easy to use by having as much validation as possible, with
meaningful error messages. Please report any error message not listed here, so I can trap the case
and improve the message.


## Errors Probably Caused in Usage

If you get one of these errors, please check your build file first.

### TaskSet.add(): no task name nor targets

Every task must be given either a non-blank string name (1st argument), or target(s) (2nd argument)
being either a non-blank string, or an array of non-blank strings, of non-zero length.

### TaskSet.add(): invalid first target: <target(s)>

If the targets argument is a string, it must have at least one element, and every element SHOULD
be a non-blank string (only the 1st element is checked here).

### TaskSet.add(): a recipe function is required

The 4th argument should be a function - the "recipe" called to generate the target(s) from the
source(s).

### TaskSet.add(): task '<task name>' already exists

Every task must have a unique name. The argument can be left falsy, in which case a name will be
generated.

### TaskSet.forEachPrereq(): prereq type not supported at the moment: <prereqs type>

Currently, the pre-requisites (or sources) - the 3rd argument of add() - can only a non-blank
string, or an array of non-blank strings.

### Task.forEachTarget(): target type not supported at the moment: '<task name>', <target type>

Currently, the target(s) - the 2rd argument of add() - can only a non-blank string, or an array of
non-blank strings.

### Task.make() '<task name>' RECURSION, stack: <make dependency stack>

There is a chain of tasks and their dependencies that form a loop. I.e. at some point the creation
of a file is dependent upon itself. Use the given dependency stack to check through the tasks to
identify the problem.

### Task.markCompleted() '<task name>' failed to make targets: <list of unmade targets>

After a recipe is executed, Ultimake checks that all the targets now exist and are newer than the
sources. If some targets have not been built, this error lists them, and shows that the recipe is
incomplete in some way. Please check, e.g. by running the recipe in isolation, and amend
accordingly.

### TaskSet.run(): no target specified to run

The run() function must be given a string argument that is interpreted as either a task name, or
else a target file to build.

### TaskSet.run(): in the middle of a previous exection

The run() function must not be called if the TaskSet object is already running a build.

### File.make(): no task identified to make '<file path>'

Ultimake is trying to build a file for which there is no task listing it as a target - either
because run() was called with this filename as argument, or because it is a prerequisite of a task
that has been invoked.


## Errors Probably Caused by Bugs in Ultimake

If you get one of these errors, there's probably an issue with Ultimake - please raise a bug.

### Task.execute(): '<task name>' has no recipe, doing nothing

This should have been already trapped by "TaskSet.add(): a recipe function is required" above.

### Task.execute(): invalid recipe <recipe> for '<task name>'

This should have been already trapped by "TaskSet.add(): a recipe function is required" above.

### Task.make() '<task name>' has already been done

Ultimake is trying to execute a task that has already been performed in this build run - this
should never need to happen, and indicates a bug in Ultimake.
