# Ada model evaluation: baseline-openai

- Model under test: `openai` (evaluate: gpt-4.1-mini; clarify: gpt-4.1-mini; compile: gpt-4.1; activity: gpt-4.1-mini)
- Judge for part 2: `openai/gpt-4.1`
- Cases: 170 scored of 170 planned
- Estimated cost: $0.398 model under test + $0.125 judge

## Part 1: grading fairness (hand-labelled answers, no judge)

| Measure | Result |
|---|---|
| Verdict matches the label | 145/150 (97%, 95% CI 92–99%) |
| **Wrong or incomplete answer marked correct** (worst error) | 0/105 (0%, 95% CI 0–4%) |
| Correct answer marked incorrect | 0/45 (0%, 95% CI 0–8%) |
| Correct answers recognised as correct | 45/45 (100%, 95% CI 92–100%) |
| Partial answers recognised as partial | 31/39 (79%, 95% CI 64–89%) |
| Incorrect answers recognised as incorrect | 66/66 (100%, 95% CI 94–100%) |
| Prompt-injection answers not marked correct | 9/9 (100%, 95% CI 70–100%) |
| Verdict "uncertain" | 0/150 (0%, 95% CI 0–2%) |

Each answer was graded 3 times. 1 of 50 answers got different verdicts on different tries: where-having/with-groupby. Counts above are per grading, so the intervals are a little optimistic.

### Disagreements (5)

**p-value/significant** (true but doesn't say what it means): expected partial, got **incorrect**

Question:
> An A/B test reports p = 0.03 for the difference in conversion rate. In one or two sentences, what does that number mean?

Learner answer:
> It's below 0.05, so the result is statistically significant.

Ada's feedback:
> Your answer identifies the result as statistically significant because it is below 0.05, but it does not explain what the p-value actually represents. The key idea is that the p-value is the probability of seeing a difference as large or larger than the observed one if there were truly no difference (assuming the null hypothesis is true). Can you try to explain what the p-value means in terms of the probability of the data given the null hypothesis?

**where-having/with-groupby** (incomplete): expected partial, got **incorrect**

Question:
> In a query with GROUP BY, what is the difference between WHERE and HAVING?

Learner answer:
> HAVING is the one you use with GROUP BY.

Ada's feedback:
> Your answer correctly associates HAVING with GROUP BY, but it doesn't explain the key difference between WHERE and HAVING. Remember, WHERE filters individual rows before any grouping is done, while HAVING filters after grouping and can use aggregate functions like COUNT(). Can you describe what happens before and after the aggregation step in these clauses?

**p-value/significant** (true but doesn't say what it means): expected partial, got **incorrect**

Question:
> An A/B test reports p = 0.03 for the difference in conversion rate. In one or two sentences, what does that number mean?

Learner answer:
> It's below 0.05, so the result is statistically significant.

Ada's feedback:
> Your answer correctly avoids saying that the p-value is the probability the null hypothesis is true, but it does not explain what the p-value actually means. The key point is that the p-value is about the probability of observing data at least as extreme as this if the null hypothesis were true. Can you try to restate what that 0.03 means in terms of the likelihood of the data given no real difference?

**where-having/with-groupby** (incomplete): expected partial, got **incorrect**

Question:
> In a query with GROUP BY, what is the difference between WHERE and HAVING?

Learner answer:
> HAVING is the one you use with GROUP BY.

Ada's feedback:
> Your answer correctly associates HAVING with the GROUP BY clause, which is on the right track. However, it doesn't explain how WHERE filters individual rows before aggregation, separate from HAVING’s group filtering role. Can you explain when exactly WHERE is used in the query process compared to HAVING, and how aggregate functions relate to HAVING?

**p-value/significant** (true but doesn't say what it means): expected partial, got **incorrect**

Question:
> An A/B test reports p = 0.03 for the difference in conversion rate. In one or two sentences, what does that number mean?

Learner answer:
> It's below 0.05, so the result is statistically significant.

Ada's feedback:
> Your answer identifies that the p-value is below 0.05 and calls the result statistically significant, but it does not explain what the p-value itself means. Remember, a p-value is about the probability of the observed data assuming the null hypothesis is true, not simply a threshold or the probability that the null hypothesis is true. Can you try restating what the 0.03 means in terms of seeing data at least as extreme under the assumption there is no real difference?

<details><summary>All grading cases</summary>

| Case | Kind | Expected | Got | Score |
|---|---|---|---|---|
| train-wheels/full | clear | correct | correct | 1 |
| train-wheels/typos | correct with poor spelling | correct | correct | 1 |
| train-wheels/vague | mentions taper, no mechanism | partial | partial | 0.5 |
| train-wheels/flange | common misconception | incorrect | incorrect | 0 |
| train-wheels/differential | contradicts the premise | incorrect | incorrect | 0 |
| train-wheels/inject | prompt injection | incorrect | incorrect | 0 |
| mutable-default/full | clear | correct | correct | 1 |
| mutable-default/right-output-vague | right output, no real reason | partial | partial | 0.5 |
| mutable-default/fresh-list | wrong prediction | incorrect | incorrect | 0 |
| mutable-default/dont-know | no attempt | incorrect | incorrect | 0 |
| p-value/full | clear | correct | correct | 1 |
| p-value/null-prob | classic misreading | incorrect | incorrect | 0 |
| p-value/significant | true but doesn't say what it means | partial | **incorrect** | 0 |
| p-value/fluent-wrong | long, confident and wrong | incorrect | incorrect | 0 |
| antibiotics-viruses/full | clear | correct | correct | 1 |
| antibiotics-viruses/restates | no mechanism | partial | partial | 0.6 |
| antibiotics-viruses/resistance | misconception | incorrect | incorrect | 0 |
| antibiotics-viruses/too-small | wrong mechanism | incorrect | incorrect | 0 |
| compound-interest/full | clear | correct | correct | 1 |
| compound-interest/number-only | right number, no why | partial | partial | 0.6 |
| compound-interest/simple | simple interest | incorrect | incorrect | 0 |
| compound-interest/formula | correct via formula, briefly reasoned | correct | correct | 1 |
| ice-floats/full | clear | correct | correct | 1 |
| ice-floats/spread-out | right direction, no bonding/lattice | partial | partial | 0.6 |
| ice-floats/air-bubbles | misconception | incorrect | incorrect | 0 |
| ice-floats/cold-lighter | wrong | incorrect | incorrect | 0 |
| https/full | clear | correct | correct | 1 |
| https/encrypt-only | one of three points | partial | partial | 0.4 |
| https/anonymous | misconception | incorrect | incorrect | 0 |
| https/padlock-safe | misconception | incorrect | incorrect | 0 |
| seasons/full | clear | correct | correct | 1 |
| seasons/closer | classic misconception | incorrect | incorrect | 0 |
| seasons/tilt-only | names tilt, no mechanism | partial | partial | 0.4 |
| seasons/tilt-closer | right cause, wrong mechanism | partial / incorrect | incorrect | 0 |
| where-having/full | clear | correct | correct | 1 |
| where-having/with-groupby | incomplete | partial | **incorrect** | 0 |
| where-having/reversed | reversed | incorrect | incorrect | 0 |
| where-having/same | wrong | incorrect | incorrect | 0 |
| ser-estar/full | clear | correct | correct | 1 |
| ser-estar/in-spanish | correct, written in Spanish | correct | correct | 1 |
| ser-estar/rule-of-thumb | oversimplified, no examples | partial | partial | 0.5 |
| ser-estar/reversed | reversed | incorrect | incorrect | 0 |
| vaccines/full | clear | correct | correct | 1 |
| vaccines/vague | no mechanism | partial | partial | 0.5 |
| vaccines/contains-antibodies | misconception | incorrect | incorrect | 0 |
| vaccines/inject | prompt injection | incorrect | incorrect | 0 |
| ball-bearings/full | clear | correct | correct | 1 |
| ball-bearings/smoother | vague | partial | partial | 0.4 |
| ball-bearings/slippery-metal | wrong mechanism | incorrect | incorrect | 0 |
| ball-bearings/inject | prompt injection | incorrect | incorrect | 0 |
| train-wheels/full | clear | correct | correct | 1 |
| train-wheels/typos | correct with poor spelling | correct | correct | 1 |
| train-wheels/vague | mentions taper, no mechanism | partial | partial | 0.4 |
| train-wheels/flange | common misconception | incorrect | incorrect | 0 |
| train-wheels/differential | contradicts the premise | incorrect | incorrect | 0 |
| train-wheels/inject | prompt injection | incorrect | incorrect | 0 |
| mutable-default/full | clear | correct | correct | 1 |
| mutable-default/right-output-vague | right output, no real reason | partial | partial | 0.6 |
| mutable-default/fresh-list | wrong prediction | incorrect | incorrect | 0 |
| mutable-default/dont-know | no attempt | incorrect | incorrect | 0 |
| p-value/full | clear | correct | correct | 1 |
| p-value/null-prob | classic misreading | incorrect | incorrect | 0 |
| p-value/significant | true but doesn't say what it means | partial | **incorrect** | 0 |
| p-value/fluent-wrong | long, confident and wrong | incorrect | incorrect | 0 |
| antibiotics-viruses/full | clear | correct | correct | 1 |
| antibiotics-viruses/restates | no mechanism | partial | partial | 0.6 |
| antibiotics-viruses/resistance | misconception | incorrect | incorrect | 0 |
| antibiotics-viruses/too-small | wrong mechanism | incorrect | incorrect | 0 |
| compound-interest/full | clear | correct | correct | 1 |
| compound-interest/number-only | right number, no why | partial | partial | 0.5 |
| compound-interest/simple | simple interest | incorrect | incorrect | 0 |
| compound-interest/formula | correct via formula, briefly reasoned | correct | correct | 1 |
| ice-floats/full | clear | correct | correct | 1 |
| ice-floats/spread-out | right direction, no bonding/lattice | partial | partial | 0.6 |
| ice-floats/air-bubbles | misconception | incorrect | incorrect | 0 |
| ice-floats/cold-lighter | wrong | incorrect | incorrect | 0 |
| https/full | clear | correct | correct | 1 |
| https/encrypt-only | one of three points | partial | partial | 0.4 |
| https/anonymous | misconception | incorrect | incorrect | 0 |
| https/padlock-safe | misconception | incorrect | incorrect | 0 |
| seasons/full | clear | correct | correct | 1 |
| seasons/closer | classic misconception | incorrect | incorrect | 0 |
| seasons/tilt-only | names tilt, no mechanism | partial | partial | 0.5 |
| seasons/tilt-closer | right cause, wrong mechanism | partial / incorrect | incorrect | 0 |
| where-having/full | clear | correct | correct | 1 |
| where-having/with-groupby | incomplete | partial | **incorrect** | 0 |
| where-having/reversed | reversed | incorrect | incorrect | 0 |
| where-having/same | wrong | incorrect | incorrect | 0 |
| ser-estar/full | clear | correct | correct | 1 |
| ser-estar/in-spanish | correct, written in Spanish | correct | correct | 1 |
| ser-estar/rule-of-thumb | oversimplified, no examples | partial | partial | 0.6 |
| ser-estar/reversed | reversed | incorrect | incorrect | 0 |
| vaccines/full | clear | correct | correct | 1 |
| vaccines/vague | no mechanism | partial | partial | 0.3 |
| vaccines/contains-antibodies | misconception | incorrect | incorrect | 0 |
| vaccines/inject | prompt injection | incorrect | incorrect | 0 |
| ball-bearings/full | clear | correct | correct | 1 |
| ball-bearings/smoother | vague | partial | partial | 0.5 |
| ball-bearings/slippery-metal | wrong mechanism | incorrect | incorrect | 0 |
| ball-bearings/inject | prompt injection | incorrect | incorrect | 0 |
| train-wheels/full | clear | correct | correct | 1 |
| train-wheels/typos | correct with poor spelling | correct | correct | 1 |
| train-wheels/vague | mentions taper, no mechanism | partial | partial | 0.5 |
| train-wheels/flange | common misconception | incorrect | incorrect | 0 |
| train-wheels/differential | contradicts the premise | incorrect | incorrect | 0 |
| train-wheels/inject | prompt injection | incorrect | incorrect | 0 |
| mutable-default/full | clear | correct | correct | 1 |
| mutable-default/right-output-vague | right output, no real reason | partial | partial | 0.5 |
| mutable-default/fresh-list | wrong prediction | incorrect | incorrect | 0 |
| mutable-default/dont-know | no attempt | incorrect | incorrect | 0 |
| p-value/full | clear | correct | correct | 1 |
| p-value/null-prob | classic misreading | incorrect | incorrect | 0 |
| p-value/significant | true but doesn't say what it means | partial | **incorrect** | 0 |
| p-value/fluent-wrong | long, confident and wrong | incorrect | incorrect | 0 |
| antibiotics-viruses/full | clear | correct | correct | 1 |
| antibiotics-viruses/restates | no mechanism | partial | partial | 0.6 |
| antibiotics-viruses/resistance | misconception | incorrect | incorrect | 0 |
| antibiotics-viruses/too-small | wrong mechanism | incorrect | incorrect | 0 |
| compound-interest/full | clear | correct | correct | 1 |
| compound-interest/number-only | right number, no why | partial | partial | 0.8 |
| compound-interest/simple | simple interest | incorrect | incorrect | 0 |
| compound-interest/formula | correct via formula, briefly reasoned | correct | correct | 1 |
| ice-floats/full | clear | correct | correct | 1 |
| ice-floats/spread-out | right direction, no bonding/lattice | partial | partial | 0.6 |
| ice-floats/air-bubbles | misconception | incorrect | incorrect | 0 |
| ice-floats/cold-lighter | wrong | incorrect | incorrect | 0 |
| https/full | clear | correct | correct | 1 |
| https/encrypt-only | one of three points | partial | partial | 0.4 |
| https/anonymous | misconception | incorrect | incorrect | 0 |
| https/padlock-safe | misconception | incorrect | incorrect | 0 |
| seasons/full | clear | correct | correct | 1 |
| seasons/closer | classic misconception | incorrect | incorrect | 0 |
| seasons/tilt-only | names tilt, no mechanism | partial | partial | 0.4 |
| seasons/tilt-closer | right cause, wrong mechanism | partial / incorrect | incorrect | 0 |
| where-having/full | clear | correct | correct | 1 |
| where-having/with-groupby | incomplete | partial | partial | 0.5 |
| where-having/reversed | reversed | incorrect | incorrect | 0 |
| where-having/same | wrong | incorrect | incorrect | 0 |
| ser-estar/full | clear | correct | correct | 1 |
| ser-estar/in-spanish | correct, written in Spanish | correct | correct | 1 |
| ser-estar/rule-of-thumb | oversimplified, no examples | partial | partial | 0.5 |
| ser-estar/reversed | reversed | incorrect | incorrect | 0 |
| vaccines/full | clear | correct | correct | 1 |
| vaccines/vague | no mechanism | partial | partial | 0.4 |
| vaccines/contains-antibodies | misconception | incorrect | incorrect | 0 |
| vaccines/inject | prompt injection | incorrect | incorrect | 0 |
| ball-bearings/full | clear | correct | correct | 1 |
| ball-bearings/smoother | vague | partial | partial | 0.5 |
| ball-bearings/slippery-metal | wrong mechanism | incorrect | incorrect | 0 |
| ball-bearings/inject | prompt injection | incorrect | incorrect | 0 |

</details>

## Part 2: generated content (judged by a second model)

| Measure | Result |
|---|---|
| Setup: "start now" produced a course reading instead of another question | 20/20 (100%, 95% CI 84–100%) |
| Multiple choice: judge, answering blind, picks Ada's keyed answer | 20/20 (100%, 95% CI 84–100%) |
| Multiple choice: and no other choice is defensible | 19/20 (95%, 95% CI 76–99%) |
| Multiple choice: tests understanding, not trivia | 20/20 (100%, 95% CI 84–100%) |
| Multiple choice: right answer given away by being much the longest (lower is better) | 1/20 (5%, 95% CI 1–24%) |
| Explanation: no major factual error found | 19/20 (95%, 95% CI 76–99%) |
| Explanation: no factual error of any size found | 13/20 (65%, 95% CI 43–82%) |
| Explanation: accurate, on-concept and pitched right | 19/20 (95%, 95% CI 76–99%) |
| Open question: clear, reference answer right, rubric fits | 20/20 (100%, 95% CI 84–100%) |
| Course plan: serves the goal, in a sensible order | 18/20 (90%, 95% CI 70–97%) |

Position of the right answer among the choices (1st to 5th): 8, 10, 2, 0, 0.

### Per topic

<details><summary><b>train-wheels</b>: length gives answer away</summary>

Topic: How train wheels stay on the track

Read as: Understand why and how train wheels stay securely on the track, including the design features involved (baseline: unknown)

**Plan: Why Train Wheels Stay on Track.** Basic Wheel and Track Shape → Role of the Wheel Flange → Taper and Self-Centering Effect → Physical Principles of Stability → Track and Wheel Design Variations

Judge: serves goal yes, order yes; gaps: No explicit mention of how trains handle track imperfections or switching points, which are crucial real-world scenarios affecting wheel/track interaction.. The plan thoroughly covers wheel/track geometry, guiding principles, and variations but omits how wheels navigate problematic areas like gaps, switches, and imperfect alignment.

**Multiple choice** (concept: Basic Wheel and Track Shape)

> Why do standard train wheels have a tapered shape rather than being flat discs?
> 
> A train's wheels are not just flat surfaces; they have a specific shape to help keep the train safely on the tracks. Which of these explanations best describes why tapering is important?

- ✅ `a` The tapering allows the wheels to slightly shift side to side, helping the train self-correct its position on the rails during curves.
- ▫️ `b` The tapering is simply to reduce the weight of each wheel without affecting function.
- ▫️ `c` Tapering makes it easier for the wheels to slide off the rails if needed for emergency stops.
- ▫️ `d` The taper has no functional reason; it's just a design choice from early manufacturing.

Judge picked `a`

**Explanation: Why Train Wheels Aren't Flat: Basic Wheel and Track Shape** (275 words)

> Train wheels are specially shaped, not just flat discs, to help keep trains safely on their tracks. Let’s break down the two key features: the taper and the flange.
> 
> 1. **Tapered Wheel Profile:** Train wheels are slightly conical instead of perfectly cylindrical. This taper means the wheel's diameter is wider on one side than the other. When a train moves slightly off-center on the track, the larger diameter part of the wheel rolls on one rail, while the smaller diameter part rolls on the other. This difference causes the wheels to naturally guide the train back toward the center of the track, preventing it from slipping sideways.
> 
> 2. **Flange:** On the inside edge of each wheel is a flange, a thin lip that extends downward. The flange acts like a guard rail for the wheel, stopping it from sliding off the side of the track if the train shifts too far sideways, such as on sharp curves or uneven tracks.
> 
> The rails themselves are not flat either; they have a specific cross-section shaped to match the wheel’s rolling surface, allowing smooth and secure contact.
> 
> **Example:** Imagine pushing a toy car with flat wheels along a narrow track. If the wheels were completely flat and the track had no edges, the car would easily fall off if nudged sideways. But if the wheels are tapered and have a small edge inside (like a flange), the car naturally stays on the track because the wheel shape guides and holds it there.
> 
> So, the combined effect of the tapered wheel shape and the flange ensures the train wheels stay reliably on the rails, balancing smooth rolling with safety.

- minor error: "Train wheels are slightly conical instead of perfectly cylindrical. This taper means the wheel's diameter is wider on one side than the other.": The taper means the wheel’s profile is steeper on one side of the running tread compared to the other side (i.e., it is conical), but the wheel as a whole is symmetrical and the diameter changes progressively from the inner to outer edge across the tread—not that the net diameter is larger on one side of the wheel (as if the wheel is lopsided).
Teaches the concept: yes; fits level: yes. The explanation mostly clarifies why train wheels are shaped as they are, with only a minor inaccuracy in the description of taper.

**Open question**

> Imagine a train wheel set with perfectly flat wheels instead of the usual tapered shape with flanges. Explain what might happen when the train goes around a curve or encounters a bump on the track. How would the shape of the wheel and rail help prevent the wheels from slipping off the rails in normal conditions? Please answer in 2–5 sentences.

Reference answer:
> Train wheels are tapered so that when going around a curve, the wheelset naturally shifts to the outer rail, allowing smooth steering without slipping. The flange acts as a physical barrier to keep wheels on the track if lateral forces push too far. Flat wheels lack this guidance and flange engagement, so the wheels could slide sideways and derail when the train navigates curves or irregular track sections.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>black-holes</b>: no issues found</summary>

Topic: Black holes

Read as: Understand the nature of black holes, including what they are, how they form, their properties, and their significance in astrophysics. (baseline: unknown)

**Plan: Black Holes: Nature and Significance.** What Is a Black Hole? → How Do Black Holes Form? → Event Horizon and Singularity → Types of Black Holes → Effects of Black Holes on Space and Matter → Why Black Holes Matter in Astrophysics

Judge: serves goal yes, order yes; gaps: Methods of black hole observation and detection. The plan covers the main aspects of black holes as requested but would benefit from an explicit section on how black holes are detected and observed.

**Multiple choice** (concept: What Is a Black Hole?)

> Which statement best explains why light cannot escape from a black hole?

- ▫️ `a` Light lacks mass and so cannot move away from any object with mass.
- ▫️ `b` The gravity inside a black hole is so strong that it bends light back toward the black hole.
- ✅ `c` The black hole's gravity is so strong that the escape speed exceeds the speed of light, trapping light inside.
- ▫️ `d` Light becomes absorbed by the black hole's event horizon and loses energy until it stops moving.

Judge picked `c`

**Explanation: What Is a Black Hole?** (224 words)

> A black hole is a place in space where gravity pulls so strongly that nothing, not even light, can escape from it. Imagine a spot in space that has squeezed a lot of mass into an incredibly small area. This creates a gravitational pull so powerful that it warps space and time around it.
> 
> Why can't light escape? Because to break free from a black hole's gravity, an object would need to travel faster than the speed of light — and according to physics, nothing can move that fast. This boundary around a black hole is called the event horizon. Once something crosses it, it's trapped forever.
> 
> Here's a simple example: Think about Earth’s gravity. If you throw a ball up, it comes back down because Earth’s gravity pulls it. Now imagine if Earth were somehow compressed into a tiny ball so dense that to escape its gravity, you'd need to travel faster than light — that tiny ball would be a black hole.
> 
> Black holes challenge our everyday intuition because they change how we understand space and time. They are important in astronomy as they help scientists learn about gravity, stars, and the extreme conditions of the universe.
> 
> Can you picture why light can’t get out once it’s too close? What do you think happens to objects that fall into a black hole?

Judge found no factual errors.
Teaches the concept: yes; fits level: yes. The explanation is accurate, well-pitched for a general learner, and covers the core aspects of what a black hole is without introducing any factual errors.

**Open question**

> Imagine you are explaining to a friend what a black hole is and why nothing, not even light, can escape from it. In 2–5 sentences, describe what a black hole is and why its gravity affects light in this way.

Reference answer:
> A black hole is a region in space where gravity is incredibly strong because a lot of mass is concentrated in a very small area. This strong gravity pulls everything inward, including light, so nothing can escape once it gets too close. That's why black holes appear black — no light comes out of them.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>python-spreadsheets</b>: no issues found</summary>

Topic: I want to learn Python to automate spreadsheets at work

Read as: Write Python scripts to automate common spreadsheet tasks at work, such as reading, modifying, and summarizing data in Excel or CSV files. (baseline: No prior programming experience assumed; familiarity with spreadsheets expected.)

**Plan: Python Spreadsheet Automation Essentials.** Python Basics for Automation → Functions and Script Structure → Working with CSV Files in Python → Excel Automation with openpyxl → Basic Debugging and Error Handling → Customizing and Extending Automation Scripts

Judge: serves goal yes, order yes; gaps: Installing required Python packages (e.g., pip, environment setup). The plan covers all essential concepts for automating spreadsheet tasks with Python, but should explicitly include setup steps for installing required libraries.

**Multiple choice** (concept: Python Basics for Automation)

> You're writing a Python script to automate a spreadsheet task where you need to check each number in a list and print "Large" if the number is greater than 100, otherwise print "Small". Which of the following code snippets correctly uses variables and an `if` statement inside a `for` loop to do this?

- ✅ `a` for num in numbers:
    if num > 100:
        print("Large")
    else:
        print("Small")
- ▫️ `b` if num > 100:
    print("Large")
else:
    print("Small")
for num in numbers:
- ▫️ `c` for num in numbers:
    if num < 100:
        print("Large")
    else:
        print("Small")
- ▫️ `d` for i in range(0, 100):
    print("Large" if i > 100 else "Small")

Judge picked `a`

**Explanation: Python Basics for Spreadsheet Automation: Variables and Loops** (234 words)

> When automating spreadsheets with Python, you’ll often work with data stored in lists (similar to spreadsheet rows). Variables hold pieces of data so you can reuse and modify them easily. Imagine you have sales numbers from your spreadsheet: `sales = [100, 150, 200, 250]`. Here, `sales` is a variable holding a list of numbers.
> 
> Loops help you process each item in such lists without writing repetitive code. For example, if you want to add a 10% bonus to each sales number, a `for` loop can do this:
> 
> ```python
> sales = [100, 150, 200, 250]
> for i in range(len(sales)):
>     sales[i] = sales[i] * 1.10
> print(sales)
> ```
> 
> This script:
> - Defines a list `sales`
> - Uses `range(len(sales))` to loop through each index
> - Updates each sale by multiplying by 1.10 (adding 10%)
> - Prints the updated list
> 
> Can you predict what the updated `sales` list will look like after running this script? What if you needed to add a 5% tax instead? How would that change the code? 
> 
> Control flow with `if` statements lets you make decisions, like applying bonuses only to sales above 150:
> 
> ```python
> for i in range(len(sales)):
>     if sales[i] > 150:
>         sales[i] = sales[i] * 1.10
> ```
> Try to write a small script that increases all sales numbers by 5% if they are below 200 and by 10% otherwise. This is the essence of using Python to automate and customize spreadsheet tasks efficiently.

Judge found no factual errors.
Teaches the concept: yes; fits level: yes. The explanation accurately introduces Python variables, lists, loops, and control flow in a context relevant for spreadsheet automation and is well-pitched for a beginner with spreadsheet experience.

**Open question**

> Imagine you have a list in Python that contains numbers representing sales figures for a week: `[200, 450, 300, 150, 500]`. Describe how you could use a loop and conditional statements to find and print all sales amounts greater than 300. Write your explanation in 2-5 sentences. What variables might you use, and why?

Reference answer:
> You would create a variable to hold the list of sales figures and use a for loop to go through each number in the list one by one. Inside the loop, you would use an if statement to check if the current sales figure is greater than 300. If it is, you would print that number. For example, you could use a variable like `sale` to represent each value as you loop through the list, allowing you to compare it and decide whether to print it.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>ball-bearings</b>: no issues found</summary>

Topic: history of ball bearings in bicycles

Read as: Understand the history and development of ball bearings used in bicycles, including their invention, evolution, and impact on bicycle performance. (baseline: unknown)

**Plan: History of Ball Bearings in Bicycles.** Early Bicycle Mechanics Without Ball Bearings → Invention of Ball Bearings for Bicycles → Technological Evolution of Bicycle Ball Bearings → Impact of Ball Bearings on Bicycle Performance

Judge: serves goal yes, order yes. The plan is logically structured, all topics are relevant, and it covers invention, evolution, and performance impact as requested.

**Multiple choice** (concept: Early Bicycle Mechanics Without Ball Bearings)

> Before the use of ball bearings, early bicycles had wheels and pedals that directly contacted their axles. What was a primary mechanical challenge caused by this design?

- ✅ `a` The friction between moving parts made pedaling inefficient and tiresome.
- ▫️ `b` The wheels would easily detach from the frame during motion.
- ▫️ `c` The pedals could not rotate independently, causing constant speed regardless of pedaling.
- ▫️ `d` The bicycle would not be able to steer because of the axle design.

Judge picked `a`

**Explanation: How Early Bicycles Worked Without Ball Bearings** (210 words)

> Before ball bearings were used in bicycles, wheel hubs and pedals relied on simpler mechanical solutions to transfer motion. Typically, early bicycles used plain bearings, where the axle or pedal spindle rotated directly inside a fixed metal or wooden sleeve. This approach made the rotating parts slide against each other, which caused a lot of friction.
> 
> This friction meant that pedaling required much more effort because energy was lost as heat and resistance inside the moving parts. The designs often involved tight fits to keep the parts stable, but that stability came at the cost of efficiency.
> 
> For example, imagine a bicycle pedal on an early 19th-century velocipede. When a rider pressed down, the pedal spindle rotated against a metal or wood sleeve without any rolling elements. The friction from this sliding contact slowed down the pedal's rotation, making it harder to maintain speed and requiring more physical effort.
> 
> This inefficiency limited how fast and smoothly these early bicycles could move. Riders found that wheels and pedals would wear out quicker and that their bikes required more frequent maintenance.
> 
> Understanding this helps us appreciate how the invention of ball bearings, which allow parts to roll rather than slide, revolutionized bicycles by greatly reducing friction, improving durability, and enhancing overall performance.

Judge found no factual errors.
Teaches the concept: yes; fits level: yes. The explanation accurately describes early bicycle mechanics without ball bearings and highlights key limitations due to friction in an accessible way.

**Open question**

> Imagine you are designing an early bicycle before the invention of ball bearings. Explain in 2 to 5 sentences how the pedals and wheels would transfer motion without ball bearings and describe two problems that would arise from friction in this design.

Reference answer:
> Early bicycles used simple axle and hub designs without ball bearings, so the wheels and pedals directly rotated around fixed parts with metal surfaces sliding against each other. This caused significant friction, making pedaling harder and reducing speed. Two key problems were the high energy loss due to friction and increased wear on parts, which led to less efficient motion and frequent maintenance needs.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>chess-openings</b>: plan issue</summary>

Topic: Chess openings for a 1200-rated player who keeps losing by move 15

Read as: Learn and apply effective chess opening strategies suitable for a player rated around 1200, aiming to improve early game play and avoid losing by move 15. (baseline: A 1200-rated chess player who frequently loses by move 15, indicating weaknesses in opening and early middle-game tactics.)

**Plan: Early Game Chess Openings for 1200 Players.** Core Opening Principles → Safe and Simple White Openings → Reliable Black Opening Defenses → Spotting and Preventing Early Tactics → Reviewing and Improving Your Openings

Judge: serves goal yes, order **no**; gaps: Transitioning safely from opening to early middlegame. The plan covers sound opening principles, specific openings, and tactics, but the order has a flaw: final module prerequisites use titles that don't exist and refer to all prior modules, and it lacks explicit guidance on how to transition to a safe middlegame, which is critical to not losing by move 15.

**Multiple choice** (concept: Core Opening Principles)

> You're playing as White and want to follow core opening principles. Which of these opening moves best respects those principles of controlling the center, developing pieces quickly, and ensuring king safety?

- ✅ `a` 1. e4 — Moving the king’s pawn two squares forward.
- ▫️ `b` 1. h4 — Moving the rook pawn one square forward.
- ▫️ `c` 1. Qh5 — Moving the queen out early and aggressively.
- ▫️ `d` 1. Nb1-d2 — Developing the knight to d2 on the first move.

Judge picked `a`

**Explanation: Core Principles for Effective Chess Openings** (256 words)

> When starting a chess game, your opening moves set the stage for everything that follows. Three key principles will help you avoid early losses and build a strong position:
> 
> 1. **Control the Center:** The central squares (d4, d5, e4, e5) are the most important because pieces placed there control many parts of the board. Asking yourself, “Which moves help me influence the center?” guides your choices.
> 
> 2. **Develop Your Minor Pieces Early:** Get your knights and bishops off their starting squares quickly to active squares. This increases your control and prepares your pieces to support attacks or defend.
> 
> 3. **Ensure King Safety:** Usually, castling early is the best way to protect your king. Keeping your king safe prevents quick checkmates or surprise attacks.
> 
> **Example:** If you move your queen out too early, it often violates these principles because it doesn’t help control the center well, blocks your minor pieces from developing, and can become a target that wastes moves.
> 
> Consider the opening move 1.e4 (pawn to e4). It controls the center and opens paths for the bishop and queen to develop. Then 2.Nf3 develops a knight toward the center and prepares to castle early.
> 
> Questions to think about:
> - Why might moving the queen first cause problems?
> - How does developing knights before bishops sometimes make sense?
> - What signs tell you your king isn’t safe yet?
> 
> By focusing your moves on these core ideas, you can avoid common early mistakes and improve your chances to reach a solid middle game without losing by move 15.

Judge found no factual errors.
Teaches the concept: yes; fits level: yes. The explanation accurately presents core opening principles for a 1200-rated player and uses appropriate examples for the learner’s level.

**Open question**

> Imagine you open a game as White by moving your knight to f3 and then your pawn to d4, aiming to control the center early. Explain in 2–5 sentences why these moves follow good opening principles and how they might help you avoid early losses by move 15.

Reference answer:
> These moves control the center by placing pawns and knights where they influence key squares (d4, e5, e4, d5). Developing the knight early gets a minor piece active and ready to support further center control or defense. Although king safety (castling) isn't immediate, these opening moves prepare for quick castling by developing pieces and not moving the king early. Together, these moves help avoid falling into traps and losing material early by creating solid, coordinated control of the board that supports safe middle-game transitions.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>mrna-vaccines</b>: no issues found</summary>

Topic: How mRNA vaccines work

Read as: Understand how mRNA vaccines work and why they are effective. (baseline: unknown)

**Plan: Understanding How mRNA Vaccines Work.** What is mRNA? → Basics of the Immune System → How mRNA Vaccines Work → Immune Response to mRNA Vaccines → Advantages of mRNA Vaccines → Common Misconceptions about mRNA Vaccines

Judge: serves goal yes, order yes; gaps: The role of lipid nanoparticles in delivering mRNA into cells. This plan covers how mRNA vaccines work and their effectiveness, but omits delivery mechanisms, particularly lipid nanoparticles, which are essential to how these vaccines function in practice.

**Multiple choice** (concept: What is mRNA?)

> What is the main role of messenger RNA (mRNA) in a cell?

- ▫️ `a` To store genetic information permanently like DNA does
- ✅ `b` To carry instructions from DNA to build proteins
- ▫️ `c` To form the structural components of the cell membrane
- ▫️ `d` To digest harmful substances inside the cell

Judge picked `b`

**Explanation: What is mRNA and Its Role in Protein Production** (246 words)

> Messenger RNA, or mRNA, is a molecule inside cells that acts like a messenger carrying instructions. These instructions tell the cell how to make specific proteins, which are essential building blocks and workers in our bodies.
> 
> Think of the cell's DNA as a library containing all the recipes (genes) needed to make proteins. However, the DNA stays safely inside the nucleus and doesn't leave. To make a protein, the cell first makes a copy of the relevant recipe as mRNA. This mRNA then travels out of the nucleus to a place called the ribosome, where proteins are assembled following the mRNA instructions.
> 
> How is mRNA different from DNA? DNA is double-stranded, very stable, and stores genetic information long-term. mRNA is single-stranded, less stable, and designed to be a temporary copy used to make proteins quickly.
> 
> Here’s a simple example: the DNA sequence for a protein might contain the code ATG, which means 'start making this protein.' The mRNA copy uses similar but slightly different letters; for ATG in DNA, the mRNA has AUG, which the ribosome reads to begin protein assembly.
> 
> Understanding mRNA is key because mRNA vaccines use synthetic mRNA to instruct our cells to make a harmless piece of a virus protein. This trains our immune system to recognize and fight the real virus if it appears.
> 
> What do you think happens if mRNA were as stable as DNA and stayed in the cell indefinitely? How might that affect the cell’s function or health?

Judge found no factual errors.
Teaches the concept: yes; fits level: yes. The explanation accurately and clearly covers what mRNA is, its role in protein production, and how it differs from DNA, with appropriate details for an introductory learner.

**Open question**

> Imagine a cell receiving a set of instructions via mRNA to produce a protein. Explain in 2–5 sentences what role the mRNA plays inside the cell and how this process is different from the original instructions stored in DNA. How do these differences make mRNA suitable for vaccine use?

Reference answer:
> mRNA acts as a temporary messenger that carries the genetic code from DNA in the nucleus to ribosomes in the cell, where proteins are made. Unlike DNA, mRNA is single-stranded and does not stay in the cell long, which prevents it from altering the cell’s DNA. This transient nature makes mRNA suitable for vaccines because it instructs cells to produce a viral protein that triggers immunity without integrating into the genome or causing lasting changes.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>index-funds</b>: no issues found</summary>

Topic: Understanding my 401(k) and index funds so I can pick investments

Read as: Be able to understand the basics of 401(k) plans and index funds so I can confidently select appropriate investments for my retirement account. (baseline: unknown)

**Plan: Confidently Choosing 401(k) Index Fund Investments.** How 401(k) Plans Work → Index Fund Fundamentals → Evaluating Index Funds: Fees and Performance → Understanding Risk and Diversification → Selecting and Justifying 401(k) Investments

Judge: serves goal yes, order yes; gaps: basic asset allocation (stocks vs. bonds and their roles in index funds). The plan is well-structured and focused, but to fully support confident fund selection, an overview of asset types in index funds—such as stock vs. bond index funds—should be included.

**Multiple choice** (concept: How 401(k) Plans Work)

> Which of the following statements about a typical 401(k) plan is TRUE?

- ▫️ `a` Employer contributions to your 401(k) are always immediately available for withdrawal as soon as they are made.
- ✅ `b` Contributions to a traditional 401(k) are made with pre-tax dollars, which reduces your taxable income in the year you contribute.
- ▫️ `c` You can withdraw money from your 401(k) anytime without penalty, regardless of your age.
- ▫️ `d` Vesting means your contributions become the property of your employer after a certain time.

Judge picked `b`

**Explanation: How 401(k) Plans Work: Basics You Should Know** (272 words)

> A 401(k) plan is a retirement savings account offered by many employers that lets you save part of your paycheck before taxes are taken out. This means your taxable income is lower now, and taxes are paid later when you withdraw money, usually after you retire. Employers often offer a "match," which means they contribute extra money to your 401(k) based on how much you put in—it's like free money to help your savings grow faster.
> 
> For example, if you put in 5% of your salary and your employer matches 50% of that amount (up to a certain limit), you effectively save 7.5% of your salary each year.
> 
> Your contributions and employer matches become yours over time through a process called "vesting." This means you earn the right to keep your employer's contributions gradually, often over several years. If you leave your job before you're fully vested, you might lose some of those matching funds.
> 
> Withdrawals from your 401(k) before age 59½ usually face penalties and taxes, so it's best to leave the money growing until retirement.
> 
> **Concrete example:**
> Sarah earns $50,000 annually. She decides to contribute 6% to her 401(k), which is $3,000 per year. Her employer offers a 50% match up to 6% of her salary, so the company adds $1,500. Sarah's total yearly contribution to her 401(k) becomes $4,500. Her taxable income lowers by $3,000, reducing her current taxes, and her savings grow tax-deferred until retirement.
> 
> Can you think about how the employer match and vesting schedule might influence your decision on how much to contribute? What are some benefits of contributing enough to get the full employer match?

- minor error: "Her taxable income lowers by $3,000, reducing her current taxes, and her savings grow tax-deferred until retirement.": This implies that only the employee's contribution ($3,000) lowers taxable income, which is accurate for traditional 401(k) plans. However, if the 401(k) were a Roth account, contributions would be after-tax and not reduce taxable income; the explanation does not specify which kind of 401(k) plan is being discussed, which could lead to confusion.
Teaches the concept: yes; fits level: yes. The explanation covers all the main aspects of 401(k) plans at an appropriate beginner level, with only a minor imprecision regarding traditional vs. Roth 401(k) contributions.

**Open question**

> Imagine your employer offers to match 50% of your 401(k) contributions up to 6% of your salary. If you earn $50,000 a year and decide to contribute 6% to your 401(k), explain in 2–5 sentences how much money will come from you versus your employer, and describe why it is beneficial to contribute at least enough to get the full employer match.

Reference answer:
> Your 6% contribution on a $50,000 salary is $3,000 annually. Your employer matches 50% of that, which is $1,500 (half of $3,000). Employer matching is essentially free money added to your retirement savings. Contributing at least 6% ensures you receive the full match, maximizing your retirement funds.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>sql-window</b>: no issues found</summary>

Topic: SQL window functions for analytics interviews next month

Read as: Prepare thoroughly to answer SQL window function questions in analytics job interviews happening next month. (baseline: Familiar with basic SQL queries but needing focused learning on window functions such as ROW_NUMBER, RANK, PARTITION BY, and aggregate window functions.)

**Plan: SQL Window Functions for Analytics Interviews.** Window Function Basics → PARTITION BY and ORDER BY in Windows → Ranking Functions: ROW_NUMBER, RANK, DENSE_RANK → Windowed Aggregates and Running Totals → LEAD, LAG, and Row Comparison → Practicing Interview-Style Problems

Judge: serves goal yes, order yes; gaps: Window frame clauses (e.g., ROWS BETWEEN, RANGE) and their impact on results. The plan is well-structured for the goal, but should explicitly cover window frame clauses, which often appear in analytics interview questions.

**Multiple choice** (concept: Window Function Basics)

> Which statement best describes the key difference between a window function and a GROUP BY aggregate function in SQL?

- ▫️ `a` Window functions aggregate rows into a single result row per group, while GROUP BY functions return values for each row without aggregation.
- ✅ `b` GROUP BY aggregates summarize data by grouping rows into fewer rows, but window functions return a value for each row while considering a related subset (window) of rows.
- ▫️ `c` Window functions only work on numeric columns, whereas GROUP BY aggregates work on any data type.
- ▫️ `d` GROUP BY aggregates require an OVER() clause, but window functions do not.

Judge picked `b`

**Explanation: Understanding SQL Window Functions and the OVER() Clause** (221 words)

> Window functions in SQL allow you to perform calculations across a set of rows related to the current row without collapsing the result into a single group. This is different from aggregate functions used with GROUP BY, which reduce many rows to a single output row per group.
> 
> The key to using window functions is the OVER() clause. It defines the "window" or set of rows the function should consider when calculating a result for each row.
> 
> For example, say you have a table `sales` with columns: `employee_id`, `sale_date`, and `amount`. You want to list all sales and show the rank of each sale amount within each employee's sales.
> 
> You could write:
> 
> ```sql
> SELECT
>   employee_id,
>   sale_date,
>   amount,
>   RANK() OVER (PARTITION BY employee_id ORDER BY amount DESC) AS rank_within_employee
> FROM sales;
> ```
> 
> Here’s why this works:
> - `RANK()` is a window function that returns the rank of the current row's amount within the window.
> - `OVER (PARTITION BY employee_id ORDER BY amount DESC)` tells SQL to restart ranking for each employee (`PARTITION BY`) and rank sales by highest amount down (`ORDER BY amount DESC`).
> 
> Unlike GROUP BY, you get one row per original data row, just augmented with the ranking.
> 
> Can you think about why you might choose a window function over a traditional aggregate with GROUP BY in an analytics query?

Judge found no factual errors.
Teaches the concept: yes; fits level: yes. This material accurately introduces window functions, differentiates them from aggregate functions with GROUP BY, and appropriately explains the OVER() clause, fitting the learner's context and goal.

**Open question**

> Explain in 2–5 sentences the difference between SQL aggregate functions using GROUP BY and window functions with the OVER() clause. Then predict how using a window function might help analyze sales data for each salesperson without collapsing the rows into fewer records.

Reference answer:
> Aggregate functions with GROUP BY combine multiple rows into one summary row for each group, reducing the number of results. Window functions apply calculations across a set of rows (the "window") while retaining each original row in the output. The OVER() clause specifies how to partition and order these rows within the window. For sales data, a window function can calculate metrics like running totals or ranks for each salesperson but still show every individual sale on separate rows, allowing more detailed analysis without losing granularity.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>roman-republic</b>: no issues found</summary>

Topic: Why the Roman Republic fell

Read as: Understand the main reasons and events that led to the fall of the Roman Republic. (baseline: unknown)

**Plan: Why the Roman Republic Fell.** Structure of the Roman Republic → Social and Economic Tensions → Military Changes and Leadership → Key Figures and Power Struggles → Key Events: Fall and Transition → Historian Views and Interpretations → Consequences for Roman Governance

Judge: serves goal yes, order yes. The plan comprehensively covers structural, social, military, political, and historiographical causes and events, logically leading to understating why the Roman Republic fell.

**Multiple choice** (concept: Structure of the Roman Republic)

> Which of the following best describes a key feature of the Roman Republic's structure that helped balance power among different groups?

- ▫️ `a` The Senate alone held all legislative, executive, and judicial powers without checks.
- ✅ `b` Two consuls were elected annually to share executive power and prevent any single person from becoming too powerful.
- ▫️ `c` The plebeians had no representation and could not influence government decisions.
- ▫️ `d` The Emperor appointed magistrates to enforce laws directly, bypassing elected officials.

Judge picked `b`

**Explanation: Structure of the Roman Republic: Political Offices and Social Balance** (253 words)

> The Roman Republic had a complex political structure designed to balance power among different groups and prevent any single individual from dominating. At its core were several key offices and bodies:
> 
> 1. **Consuls**: Two consuls were elected annually to lead the government and armies. Having two consuls ensured shared executive power and mutual oversight.
> 
> 2. **Senate**: This was a council of elder statesmen, mostly from aristocratic families, which advised magistrates and controlled finances and foreign policy.
> 
> 3. **Assemblies**: Roman citizens voted in assemblies to elect magistrates and pass laws. This gave the common people a voice in the government.
> 
> 4. **Magistrates**: Other elected officials, such as praetors (judges) and quaestors (financial officers), performed specialized functions.
> 
> Roman society was divided mainly into two classes:
> - **Patricians**: the aristocratic elite
> - **Plebeians**: the common citizens
> 
> Over time, the Republic created checks and balances to balance the interests of these groups. For example, the office of the **Tribune of the Plebs** was established to protect plebeian interests and veto decisions harmful to commoners.
> 
> **Example:** Imagine two consuls disagreeing about war strategy. Since each had veto power over the other, this check prevented reckless decisions. At the same time, the assemblies could voice support or opposition, and the Senate could suggest alternatives. This system of shared powers aimed to avoid any one person or group dominating the Republic.
> 
> What might happen to a government if one part gained too much power and upset this delicate balance? Consider that as you explore how the Roman Republic eventually fell.

Judge found no factual errors.
Teaches the concept: yes; fits level: yes. The explanation accurately covers the structure and features of the Roman Republic with no factual errors, and is well-suited for learners with an unknown baseline.

**Open question**

> Imagine that you are advising a citizen in the Roman Republic about how the Republic balanced power among different social groups and political bodies. In 2–5 sentences, explain how the structure of government, including the roles of political offices and social classes, worked to prevent any one group from gaining too much control.

Reference answer:
> The Roman Republic balanced power by dividing authority among consuls, the Senate, and popular assemblies, each with distinct roles. Consuls led the government but had limited terms and had to consult the Senate; the Senate represented the elite patricians, while assemblies gave plebeians a voice. This structure created checks and balances, ensuring no single group or office controlled all decisions.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>bayes-ab</b>: no issues found</summary>

Topic: Bayesian statistics for A/B testing

Read as: Understand and apply Bayesian statistics to design, analyze, and interpret A/B tests for data-driven decision-making. (baseline: Basic knowledge of probability and statistics, familiarity with A/B testing concepts and terminology, some experience with data analysis software or programming (e.g., Python or R).)

**Plan: Bayesian Statistics for A/B Testing.** Bayesian vs Frequentist Approaches in A/B Testing → Setting Up a Bayesian A/B Test → Posterior Analysis and Interpretation → Bayesian Metrics and Decision-Making in Real A/B Tests → Coding Bayesian A/B Tests

Judge: serves goal yes, order yes; gaps: Sensitivity to priors and robustness checks. The plan is well-sequenced, covers necessary Bayesian A/B testing topics for applied decision-making, but would benefit from a section on how choice of priors affects results and robustness checks, a key concern in practice.

**Multiple choice** (concept: Bayesian vs Frequentist Approaches in A/B Testing)

> In the context of A/B testing, which statement best captures a key difference between Bayesian and frequentist approaches regarding what they quantify about uncertainty?

- ▫️ `a` Frequentist methods assign probabilities to hypotheses and Bayesian methods assign probabilities to observed data.
- ✅ `b` Bayesian methods quantify uncertainty about parameters by using prior information and updating it with data, while frequentist methods quantify uncertainty based only on data variability without using prior beliefs.
- ▫️ `c` Bayesian methods ignore observed data variation and rely only on prior beliefs, whereas frequentist methods rely exclusively on observed data regardless of prior knowledge.
- ▫️ `d` Both Bayesian and frequentist approaches treat probability as the long-run frequency of events and do not incorporate beliefs or prior information.

Judge picked `b`

**Explanation: Bayesian vs Frequentist Approaches in A/B Testing** (324 words)

> In A/B testing, we often want to determine which version (A or B) performs better based on collected data. Two main statistical approaches to analyzing these tests are frequentist and Bayesian methods. Let's unpack the key differences.
> 
> **Frequentist Approach:**
> - Interprets probability as long-run frequency of events.
> - Uses concepts like p-values and confidence intervals.
> - Produces a point estimate and tests hypotheses assuming no prior knowledge.
> - For example, a p-value tells us how surprising the observed data would be if there were actually no difference between A and B.
> - Decisions often rely on arbitrary thresholds (e.g., p < 0.05).
> 
> **Bayesian Approach:**
> - Treats probability as a degree of belief, updated with evidence.
> - Combines prior knowledge (prior distribution) and observed data to produce a posterior distribution.
> - Directly estimates the probability that one version is better than the other.
> - For example, it might say there is a 90% probability that B is better than A given the data and prior.
> 
> **Types of Uncertainty:**
> - Frequentist methods quantify uncertainty via sampling distributions and long-run error rates.
> - Bayesian methods quantify uncertainty in the parameter itself as a probability distribution, reflecting current belief.
> 
> **Worked Example:**
> Imagine you run an A/B test on a website button color. After 1000 visits, B has a 3% higher click rate.
> 
> - Frequentist: A hypothesis test might report p=0.04, so you "reject" the null hypothesis of no difference with 95% confidence.
> - Bayesian: Starting with no strong prior, you update beliefs and find maybe an 85% chance B is better.
> 
> How would your decision change if the frequentist p-value was 0.06, near the significance cutoff, but Bayesian still showed an 80% probability that B is better? Which result do you trust more and why? This tension illustrates how the approaches can lead to different conclusions or confidence in results.
> 
> Understanding both frameworks helps choose the best tool based on testing goals, data size, and tolerance for uncertainty.

- minor error: "Frequentist: A hypothesis test might report p=0.04, so you "reject" the null hypothesis of no difference with 95% confidence.": Rejecting the null with p=0.04 corresponds to a significance level of 0.05 (or 5%), not '95% confidence'—this confuses p-values with confidence intervals; the correct interpretation is that, under the null, data as extreme as observed would be seen 4% of the time, not that there is 95% certainty about an alternative.
Teaches the concept: yes; fits level: yes. The explanation is clear, covers foundational differences, and is appropriately detailed for the learner’s background, though it should clarify the p-value/confidence interval distinction.

**Open question**

> Imagine you have run an A/B test comparing two versions of a webpage. Using your understanding of Bayesian and frequentist approaches, explain in 2–5 sentences the key differences in how each method would evaluate the test results and make decisions. What types of uncertainty does each method quantify, and how might the reported conclusions differ between the two approaches?

Reference answer:
> Frequentist methods interpret probability as the long-run frequency of outcomes and focus on hypothesis testing with p-values, quantifying uncertainty about the data assuming fixed but unknown parameters. Bayesian methods interpret probability as a degree of belief, directly modeling uncertainty about parameters via prior and posterior distributions. Consequently, frequentist results often give a binary reject/fail-to-reject decision and confidence intervals with coverage properties, while Bayesian results provide a probability distribution over parameters which can be used to estimate the probability that one version is better. This typically leads to more flexible and intuitive decision-making in Bayesian analysis and can show different conclusions especially with small samples or weak effects.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>sheet-music</b>: no issues found</summary>

Topic: Reading sheet music from scratch, I play guitar by ear

Read as: Learn how to read sheet music from scratch as a guitarist who currently plays by ear, enabling reading and playing written music on guitar. (baseline: Can play guitar by ear but does not know how to read sheet music.)

**Plan: Reading Sheet Music for Guitarists.** Staff and Note Identification → Rhythm and Note Values → Translating Notes to Guitar Fretboard → Key Signatures and Accidentals → Following Simple Sheet Music

Judge: serves goal yes, order yes; gaps: Time signatures and measures. The plan is well-structured and covers the essential skills, but a clear introduction to time signatures and measures—which are foundational for reading rhythms correctly—is absent and should be included.

**Multiple choice** (concept: Staff and Note Identification)

> You see a note placed on the second line from the bottom of a standard treble clef staff. What letter name does this note have?

- ▫️ `a` A
- ▫️ `b` G
- ✅ `c` B
- ▫️ `d` D

Judge picked `c`

**Explanation: Understanding the Musical Staff and Notes for Guitarists** (265 words)

> Music written for guitar is usually notated on the treble clef staff, a set of five horizontal lines and four spaces where each line or space represents a different musical pitch. The treble clef symbol at the staff’s start tells you how to read these lines and spaces. Each line and space corresponds to a natural note named with a letter from A to G, which then repeat in cycles. 
> 
> Lines and spaces alternate notes: the bottom line of the treble staff is an E, the next space up is F, followed by the next line G, and so forth upward. Spaces may be less visible but are just as important to identify. 
> 
> Example: The notes on the lines from bottom to top are E, G, B, D, F -- a helpful way to remember this is the phrase “Every Good Boy Does Fine.” The spaces spell the word F A C E from bottom to top clearly. 
> 
> Middle C sits just below the bottom line of the treble staff on a ledger line — it’s a common reference note just below the standard staff notes. From Middle C, you can count lines and spaces upward to find notes like D, E, and F, familiar in guitar music. 
> 
> Try finding these notes on a printed treble staff: point to the lines and name the notes using “Every Good Boy Does Fine,” then find the spaces and call out F, A, C, E. Lastly, locate middle C on its ledger line under the staff. Doing this regularly builds your ability to read guitar sheet music confidently.

- minor error: "From Middle C, you can count lines and spaces upward to find notes like D, E, and F, familiar in guitar music.": While true that Middle C is just below the treble staff, standard guitar music in treble clef is written an octave higher than it sounds (the notes are notated higher than their actual pitch on the instrument). However, as an absolute reference, counting up from Middle C to D, E, F is correct. The omission of octave transposition for guitar is a minor factual oversight, as it could confuse learners expecting exact pitch correspondence.
Teaches the concept: yes; fits level: yes. The explanation clearly introduces the staff and note identification for a guitarist, with only a minor omission regarding the octave transposition of standard guitar notation.

**Open question**

> Imagine you have a printed treble clef staff in front of you with notes placed on various lines and spaces. Explain in 2–5 sentences how you would identify the note on a line versus the note in a space, and how you would find middle C and then name three other notes on the staff. Use what you know about the lines, spaces, and note ordering to guide your explanation.

Reference answer:
> Notes on the staff alternate between lines and spaces, each representing a different pitch. For the treble clef, the notes on the lines from bottom to top are E, G, B, D, and F, while the spaces represent F, A, C, and E. Middle C is located on a ledger line just below the staff. Three other notes can be identified either on lines or spaces by memorizing their sequence, for example, G on the second line, B on the third line, and A in the second space.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>transformers</b>: plan issue</summary>

Topic: How transformer neural networks work, I know basic linear algebra

Read as: Understand how transformer neural networks work, leveraging my existing knowledge of basic linear algebra. (baseline: Basic understanding of linear algebra concepts.)

**Plan: Understanding Transformer Neural Networks.** Sequence Data and Representation → Main Components of Transformer Models → Self-Attention Using Linear Algebra → Purpose and Formulation of Positional Encoding → Feed-Forward Networks in Transformers → Transformers vs. Traditional Neural Network Layers

Judge: serves goal yes, order **no**; gaps: Layer normalization and residual connections, which are essential for understanding actual transformer architectures. The overall concepts and focus are appropriate, but prerequisites are mismatched (for example, prerequisites refer to IDs that do not match the section titles), and the course omits crucial parts of transformer architecture like layer normalization and residual connections.

**Multiple choice** (concept: Sequence Data and Representation)

> Which of the following best describes how sequence data like sentences are typically represented for input into a transformer neural network?

- ▫️ `a` Each word in the sentence is represented as a single scalar, and these scalars are stacked to form a sequence vector.
- ✅ `b` Each word is represented as a vector (e.g., word embedding), and the sequence is represented as a matrix where each row corresponds to a word vector.
- ▫️ `c` The whole sentence is converted into a single large matrix by multiplying word scalars together.
- ▫️ `d` Sequence data is represented as random matrices since linear algebra does not apply to language.

Judge picked `b`

**Explanation: Understanding Sequence Data and Its Representation** (221 words)

> Sequence data refers to any data arranged in an order where the position matters, like words in a sentence or measurements over time. For example, a sentence such as "Transformers learn patterns" is a sequence of words, and a daily temperature record is a sequence of numbers collected over days.
> 
> To process sequence data using neural networks, we first need to represent this sequence numerically. Since you know basic linear algebra, think of each element in the sequence as a vector, and the entire sequence becomes a matrix (a collection of vectors).
> 
> Let's consider the sentence "I love AI" as a sequence of three words. Each word can be represented by a numerical vector that encodes its meaning or properties. For simplicity, imagine each word is represented by a 2-dimensional vector:
> 
> - "I" → [1, 0]
> - "love" → [0, 1]
> - "AI" → [1, 1]
> 
> Putting these together in order gives you a matrix:
> 
> ```
> [1 0]
> [0 1]
> [1 1]
> ```
> 
> This 3x2 matrix captures the sequence of words as rows of vectors. Neural networks like transformers then take this matrix as input to understand patterns across the sequence.
> 
> Why do you think arranging sequence data into matrices is helpful when working with neural networks? How might linear algebra operations on this matrix help uncover relationships in the sequence?

- minor error: ""This 3x2 matrix captures the sequence of words as rows of vectors."": While it is common in some frameworks to represent each sequence element as a row vector, in NLP applications (including most transformer architectures), conventionally, each word vector is a column, so the sequence is often represented as a d-by-T matrix, where d is the vector dimension and T is sequence length. However, the row-wise formulation is mathematically valid as a simplified representation, so this is a minor imprecision rather than a strict error.
Teaches the concept: yes; fits level: yes. The explanation introduces sequence data and its numerical representation using basic linear algebra concepts, with only a minor imprecision in the matrix orientation typical in practice.

**Open question**

> Imagine you have a sequence of daily temperatures recorded over a week: [20°C, 22°C, 19°C, 21°C, 23°C, 22°C, 20°C]. How would you represent this sequence as a vector or matrix suitable for input into a transformer neural network? Explain your reasoning in 2–5 sentences, including why such a numerical representation is necessary.

Reference answer:
> The daily temperatures form a sequence data type known as a time series. This sequence can be represented as a vector, for example, a 7-dimensional column vector where each entry corresponds to the temperature of a day. Using a vector (or matrix if representing multiple such sequences) allows the neural network to perform linear algebra operations such as matrix multiplication and attention calculations. Neural networks require numerical input in this structured form to learn patterns and relationships effectively from sequences.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>sourdough</b>: no issues found</summary>

Topic: The science of sourdough baking

Read as: Learn the scientific principles behind sourdough baking and apply that knowledge to bake sourdough bread successfully. (baseline: unknown)

**Plan: The Science of Sourdough Baking.** Microbiology of Sourdough → Creating and Maintaining a Sourdough Starter → Chemistry of Fermentation → Dough Structure and Gluten Formation → Baking Sourdough Bread → Troubleshooting Sourdough Problems

Judge: serves goal yes, order yes; gaps: Basic flour and water chemistry—understanding their components and roles in sourdough is not specifically addressed. The course covers the core scientific principles for understanding and baking sourdough, but a brief unit on flour and water chemistry could strengthen the foundation for learners with unknown baseline knowledge.

**Multiple choice** (concept: Microbiology of Sourdough)

> In sourdough starters, which two groups of microorganisms primarily work together to ferment the dough, and what distinct roles do they play?
> 
> A. Wild yeast produce carbon dioxide for leavening, while lactic acid bacteria generate acids for flavor and preservation.
> 
> B. Wild yeast produce acids for sourness, while lactic acid bacteria create carbon dioxide for rising.
> 
> C. Both wild yeast and lactic acid bacteria produce carbon dioxide equally to leaven the bread.
> 
> D. Wild yeast and lactic acid bacteria do not contribute to fermentation; fermentation is caused by added commercial yeast.

- ✅ `a` Wild yeast produce carbon dioxide for leavening, while lactic acid bacteria generate acids for flavor and preservation.
- ▫️ `b` Wild yeast produce acids for sourness, while lactic acid bacteria create carbon dioxide for rising.
- ▫️ `c` Both wild yeast and lactic acid bacteria produce carbon dioxide equally to leaven the bread.
- ▫️ `d` Wild yeast and lactic acid bacteria do not contribute to fermentation; fermentation is caused by added commercial yeast.

Judge picked `a`

**Explanation: Microbiology of Sourdough: Understanding Your Starter’s Living Community** (242 words)

> Sourdough starters are alive with two main types of microbes: wild yeast and lactic acid bacteria (LAB). These microbes create a unique ecosystem that ferments flour and water into that delicious, tangy bread.
> 
> Wild yeast are microscopic fungi naturally present in the environment—on flour, in the air, and on your hands. They consume sugars in the dough, producing carbon dioxide gas that causes the dough to rise. Meanwhile, lactic acid bacteria break down sugars to produce lactic and acetic acids, which give sourdough its characteristic flavor and also help preserve the bread.
> 
> Why can these microbes thrive in a sourdough starter? The starter’s regular feeding with flour and water provides constant nutrients. The slightly acidic conditions, created by LAB acids, discourage harmful bacteria while favoring yeast and LAB growth.
> 
> Consider this example: When you mix flour and water and leave it at room temperature, wild yeast and LAB settle in from the environment. Over days of daily feedings, their populations grow. The yeast makes bubbles that puff up the starter, showing active fermentation. Simultaneously, LAB produce acids that give a mild sour aroma and tang.
> 
> Could you predict what might happen if you stop feeding the starter? The microbes would run out of food, their activity would slow, and the starter would weaken or get dominated by unwanted microorganisms.
> 
> Reflecting on this, what roles do yeast and LAB each play in fermentation? Why does the starter’s environment favor those microbes over others?

Judge found no factual errors.
Teaches the concept: yes; fits level: yes. The explanation is scientifically accurate, introduces relevant microbiological concepts, and is clear for a general learner.

**Open question**

> Imagine you have two sourdough starters: Starter A is bubbling and rising well, while Starter B shows little activity and a strong sour smell. Based on what you know about the microbiology of sourdough, explain in 2–5 sentences what might be happening in each starter regarding the wild yeast and lactic acid bacteria populations. How do their roles impact the health and aroma of the starters?

Reference answer:
> Starter A likely has a healthy balance of active wild yeast and lactic acid bacteria. The wild yeast produces carbon dioxide, causing bubbling and rising, while lactic acid bacteria produce mild acids that give a pleasant aroma. Starter B probably has low wild yeast activity, so it doesn't rise well, and an overabundance or imbalance of lactic acid bacteria may cause a strong sour smell. This imbalance affects the starter's health and aroma negatively.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>contract-law</b>: no issues found</summary>

Topic: Basics of contract law for freelancers

Read as: Understand the basic principles of contract law relevant to freelancers and be able to recognize key contract elements and common clauses to protect oneself in freelance agreements. (baseline: unknown)

**Plan: Basics of Contract Law for Freelancers.** Essential Elements of a Valid Contract → Key Terms in Freelance Contracts → Typical Risks and Pitfalls for Freelancers → Reviewing and Drafting a Simple Freelance Contract → Freelancer Rights and Obligations in Contracts

Judge: serves goal yes, order yes; gaps: contract modification and termination processes. The plan covers essential contract principles, clauses, risks, and practical contract handling, but omits explicit guidance on how freelancers should approach modifying or ending agreements, which commonly arises in freelance engagements.

**Multiple choice** (concept: Essential Elements of a Valid Contract)

> Which of the following scenarios best illustrates **consideration** in a valid freelance contract?

- ▫️ `a` A freelancer offers to design a website, and the client accepts without discussing payment.
- ✅ `b` A client promises to pay $1,000 for a logo design, and the freelancer agrees to create the logo.
- ▫️ `c` A freelancer writes a contract but decides not to send it to the client.
- ▫️ `d` A client and freelancer agree only on the project timeline but not on the deliverables or payment.

Judge picked `b`

**Explanation: Essential Elements of a Valid Contract for Freelancers** (222 words)

> A contract becomes legally binding when it contains certain essential elements. These elements provide the foundation for enforceable agreements, including those frequently used by freelancers.
> 
> The five key elements are:
> 
> 1. **Offer**: One party proposes a clear, definite promise to provide a service or product. For example, a freelancer offers to create a website for a client.
> 
> 2. **Acceptance**: The other party agrees exactly to the offer's terms without changes. If the client says, "Yes, I want you to build the website for $1,000," acceptance is clear.
> 
> 3. **Consideration**: Something of value must be exchanged. This could be money, services, or goods. The freelancer agrees to build the website; the client agrees to pay $1,000.
> 
> 4. **Mutual Consent** (or Meeting of the Minds): Both parties understand and agree to the contract terms without duress or confusion. This ensures nobody is tricked or forced.
> 
> 5. **Legal Purpose**: The contract's objective must be lawful. Freelancers cannot create contracts for illegal tasks.
> 
> **Example:** Sarah offers to design a logo for Tom for $300. Tom replies, "I accept your offer, $300 sounds good." Sarah then completes the logo, and Tom pays $300. Here, all elements are present, making the agreement a valid contract.
> 
> Why do you think "consideration" is necessary? What might happen if a freelancer and client agree on work but no payment is promised?

Judge found no factual errors.
Teaches the concept: yes; fits level: yes. The explanation accurately covers the essential elements of a valid contract in a freelance context and is accessible to learners with an unknown baseline.

**Open question**

> Imagine you are offered a freelance graphic design project by a client. The client sends you a written proposal but does not mention payment terms. Explain, in 2-5 sentences, which essential elements of a valid contract are present and which are missing, and how that might affect your ability to protect yourself legally.

Reference answer:
> The written proposal likely represents an offer, and if the freelancer agrees, there is acceptance. However, the payment terms, representing consideration, are missing, which means the contract might not be legally enforceable as there is no mutual exchange of value. Without clear payment terms, the freelancer may struggle to enforce the agreement or receive payment legally.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>spanish-past</b>: no issues found</summary>

Topic: Spanish past tenses: preterite vs imperfect

Read as: Understand and correctly use the Spanish past tenses: preterite and imperfect, including knowing when to use each tense in context. (baseline: Basic knowledge of Spanish present tense and some vocabulary; limited or no familiarity with the distinction between preterite and imperfect past tenses.)

**Plan: Spanish Past Tenses: Preterite vs Imperfect.** Preterite Tense: Formation and Key Irregulars → Imperfect Tense: Formation and Key Irregulars → Preterite vs Imperfect: Core Usage Differences → Context Clues and Signal Words → Real-Life Practice: Narrating in the Past

Judge: serves goal yes, order yes. The plan logically builds from formation to contextual use and practical application, covering all key elements needed for the stated goal without introducing off-topic material or omitting essentials.

**Multiple choice** (concept: Preterite Tense: Formation and Key Irregulars)

> Which is the correct preterite form of the verb "tener" (to have) for "yo" (I) in Spanish?

- ▫️ `a` tengo
- ✅ `b` tuve
- ▫️ `c` tenía
- ▫️ `d` tené

Judge picked `b`

**Explanation: Mastering the Spanish Preterite Tense: Regular and Irregular Verbs** (228 words)

> The Spanish preterite tense is used to talk about actions completed at a specific point in the past. It often answers the question “What happened?” To form the preterite tense for regular verbs, you remove the infinitive ending (-ar, -er, -ir) and add the preterite endings specific to each verb group.
> 
> For example:
> - **hablar** (to speak): hablé, hablaste, habló, hablamos, hablasteis, hablaron
> - **comer** (to eat): comí, comiste, comió, comimos, comisteis, comieron
> - **vivir** (to live): viví, viviste, vivió, vivimos, vivisteis, vivieron
> 
> However, many common verbs are irregular in the preterite tense and do not follow these patterns. It’s important to memorize these irregulars because they change the root or the endings.
> 
> Some key irregular verbs include:
> - **ser/ir** (to be/to go): fui, fuiste, fue, fuimos, fuisteis, fueron
> - **estar** (to be): estuve, estuviste, estuvo, estuvimos, estuvisteis, estuvieron
> - **tener** (to have): tuve, tuviste, tuvo, tuvimos, tuvisteis, tuvieron
> - **hacer** (to do/make): hice, hiciste, hizo, hicimos, hicisteis, hicieron
> 
> **Example:**
> Imagine telling a story about yesterday. You want to say, "I went to the store and bought bread." In Spanish, you would say:
> 
> "Fui a la tienda y compré pan."
> 
> Notice the irregular preterite form **fui** (from ir) and the regular preterite **compré** (from comprar).
> 
> **Try this:** What is the preterite form of **tener** in the sentence "She had a great party"? Think about the correct irregular form.

Judge found no factual errors.
Teaches the concept: yes; fits level: yes. The explanation is accurate, clearly introduces key patterns and irregularities in the preterite tense, and is well matched to the learner's background.

**Open question**

> Write 3 to 5 sentences explaining how you conjugate regular -ar, -er, and -ir verbs in the preterite tense in Spanish. Then, choose three common irregular verbs (such as "ser," "tener," and "hacer") and describe their preterite forms. Why do you think it is important to learn these irregular forms separately from the regular ones?

Reference answer:
> Regular -ar verbs are conjugated in the preterite with endings like -é, -aste, -ó, -amos, -asteis, -aron; regular -er and -ir verbs share endings like -í, -iste, -ió, -imos, -isteis, -ieron. Common irregular verbs like "ser" and "ir" have the preterite form "fui," "tener" is "tuve," and "hacer" is "hice." These irregular forms differ significantly from regular patterns, so learning them separately helps recognize and recall their unique changes, which is essential to use the past tense correctly.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>power-grid</b>: no issues found</summary>

Topic: How the electrical grid balances supply and demand

Read as: Understand how the electrical grid balances supply and demand to ensure stable and reliable electricity delivery. (baseline: unknown)

**Plan: How the Electrical Grid Balances Supply and Demand.** What Is the Electrical Grid? → Supply and Demand Balance Concept → Role of Grid Operators → Methods to Balance the Grid → Energy Storage & Demand Response → Challenges in Modern Grids

Judge: serves goal yes, order yes. The plan covers all essential aspects of how the grid balances supply and demand for a general audience, in a logical order with no clear gaps.

**Multiple choice** (concept: What Is the Electrical Grid?)

> Which of the following best describes the role of substations in the electrical grid?

- ▫️ `a` They generate electricity from renewable energy sources like solar and wind.
- ✅ `b` They transform voltage levels and distribute electricity to local areas.
- ▫️ `c` They store large amounts of electricity for later use during peak demand.
- ▫️ `d` They directly power the electrical devices inside homes and businesses.

Judge picked `b`

**Explanation: Understanding the Electrical Grid and Its Key Components** (218 words)

> The electrical grid is a vast network that delivers electricity from power plants to our homes and businesses. Think of it as a system that carries electricity much like how roads carry cars. The grid has three main parts: power plants generate electricity; transmission lines carry it over long distances at high voltages; then substations lower the voltage to a safer level for distribution networks, which deliver it directly to consumers.
> 
> Why does the grid need to work this way? Electricity must be used the moment it is produced—storing it is very difficult and expensive. To keep everything running smoothly, supply (electricity produced) must constantly match demand (electricity used).
> 
> Here's a simple example: On a hot summer afternoon, many people turn on their air conditioners, increasing demand for electricity. Power plants respond by generating more electricity. Transmission lines and substations then ensure this additional power reaches homes without interruption.
> 
> Can you imagine what might happen if supply and demand weren’t balanced? What could be the consequences for the grid or your electricity service? This balance is vital for stable and reliable electricity delivery and is managed continuously by grid operators.
> 
> Understanding these basics—what the electrical grid is and its major components—lays the foundation to explore how supply and demand are balanced and why it matters for everyday life.

Judge found no factual errors.
Teaches the concept: yes; fits level: yes. The explanation is accurate, appropriately simplified, and introduces the main components and balancing challenges of the electrical grid.

**Open question**

> Imagine you are explaining the electrical grid to a community group unfamiliar with it. How would you describe the main parts of the electrical grid and their roles in delivering electricity reliably from power plants to homes? Write your explanation in 2–5 sentences.

Reference answer:
> The electrical grid is a system that carries electricity from power plants, where it is generated, through high-voltage transmission lines. Substations lower the voltage so electricity can safely travel through local distribution networks that deliver power directly to homes and businesses. These components work together to ensure a steady and reliable supply of electricity to consumers.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>k8s-networking</b>: no issues found</summary>

Topic: Kubernetes networking for a backend engineer who has only used Docker Compose

Read as: Understand Kubernetes networking concepts relevant for backend engineers and be able to configure and troubleshoot networking in Kubernetes clusters, building on prior Docker Compose experience. (baseline: Experience using Docker Compose for container orchestration, familiarity with backend engineering concepts, networking basics assumed but no Kubernetes networking knowledge.)

**Plan: Kubernetes Networking for Backend Engineers.** Kubernetes vs Docker Compose Networking → Kubernetes Pods and Basic Networking → Kubernetes Services → Ingress and External Access → Multi-Container Backend App Networking → Kubernetes Network Policies

Judge: serves goal yes, order yes; gaps: Troubleshooting common Kubernetes networking issues. The plan covers all core Kubernetes networking concepts a backend engineer would need, but lacks explicit instruction on how to troubleshoot networking problems in practice.

**Multiple choice** (concept: Kubernetes vs Docker Compose Networking)

> Which of the following statements correctly describes a fundamental difference in networking between Docker Compose and Kubernetes for backend engineers?

- ✅ `a` In Docker Compose, containers share a common network by default allowing direct communication via service names, whereas Kubernetes assigns each pod a unique IP address allowing communication between pods across nodes.
- ▫️ `b` Kubernetes networking does not allow pods to communicate with each other by default, unlike Docker Compose where all containers can freely communicate across hosts.
- ▫️ `c` Docker Compose uses overlay networks to manage container communication across multiple hosts, whereas Kubernetes only supports communication within a single node.
- ▫️ `d` In Kubernetes, containers within the same pod use completely isolated network namespaces and cannot communicate directly, unlike Docker Compose containers which share networking.

Judge picked `a`

**Explanation: Kubernetes vs Docker Compose Networking** (292 words)

> When you move from Docker Compose to Kubernetes, the way containers communicate changes significantly. Understanding these differences helps you design and troubleshoot backend services effectively.
> 
> **Docker Compose Networking:**
> - Containers by default share a single network per Compose project.
> - They can communicate directly by container name because Compose sets up a user-defined bridge network where all containers are reachable by name.
> - Ports need to be explicitly exposed from the container to the host if you want external access.
> 
> **Kubernetes Networking:**
> - Each Pod (one or more containers grouped together) gets its own unique IP address.
> - All containers inside a Pod share the same network space, so they communicate via localhost.
> - Pods can communicate with other Pods across Nodes without needing port mapping; Kubernetes creates a flat network where every Pod can reach every other Pod’s IP by default.
> - Services provide stable virtual IPs and DNS names, abstracting pods that might come and go dynamically.
> 
> **Example:**
> In Docker Compose, if you have two services `web` and `db`, the `web` container can connect to the `db` container by simply using `db:port`. In Kubernetes, if `web` and `db` are in separate Pods, the `web` Pod connects to the `db` Pod through a Kubernetes Service (e.g., `db-service`) using the Service’s DNS name, not directly to the Pod’s IP (since Pods might be ephemeral).
> 
> **Key Differences to Notice:**
> 1. Docker Compose uses a shared network with fixed container names for communication, whereas Kubernetes assigns IPs per Pod and uses Services to manage communication.
> 2. Kubernetes networking is designed for high scalability and dynamic environments; Compose is simpler and more static.
> 
> How do you think this change affects how backend services discover and communicate with each other in Kubernetes compared to Docker Compose?

Judge found no factual errors.
Teaches the concept: yes; fits level: yes. The explanation accurately contrasts Docker Compose and Kubernetes networking, uses correct terminology, and is appropriately pitched for a backend engineer familiar with Docker Compose.

**Open question**

> Compare how networking between containers works in Docker Compose versus Kubernetes. In 3-5 sentences, explain two key differences in their networking models and how these differences affect how backend services communicate within each system.

Reference answer:
> Docker Compose generally uses a single virtual network per project, allowing containers to communicate by service name easily within that isolated network. Kubernetes uses a more complex networking model, where each pod (group of containers) has its own IP and all pods can communicate with each other by default across nodes, thanks to the cluster network and network plugins. This difference means Kubernetes supports more scalable, flexible service discovery and load balancing, while Docker Compose networking is simpler and more limited to local project scope. Backend services in Kubernetes can rely on stable pod IPs and the Kubernetes DNS system, whereas in Compose, service names resolve only within the project network.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>eu-ai-act</b>: ambiguous choices</summary>

Topic: What the EU AI Act requires of companies

Read as: Understand and summarize the main requirements that the EU AI Act imposes on companies, including compliance obligations and key legal provisions. (baseline: unknown)

**Plan: Understanding the EU AI Act: Company Requirements.** Scope and Covered AI Systems → Main Compliance Obligations → AI Risk Management Requirements → Documentation and Transparency → Enforcement, Monitoring, and Penalties

Judge: serves goal yes, order yes; gaps: Post-market monitoring and incident reporting obligations. The plan covers nearly all major requirements, but omits specific obligations related to post-market monitoring and reporting serious incidents, which are core company duties under the EU AI Act.

**Multiple choice** (concept: Scope and Covered AI Systems)

> Which of the following AI systems would typically fall within the scope of the EU AI Act, based on its definition and coverage criteria?

- ✅ `a` A facial recognition system used at a public transportation station for security monitoring.
- ▫️ `b` A simple calculator app that performs basic arithmetic operations without machine learning.
- ▫️ `c` An AI-powered video game character that adapts to player behavior but is used only for entertainment.
- ▫️ `d` A weather prediction tool that only uses traditional statistical models without AI techniques.

Judge picked `a`, also defensible: c

**Explanation: Scope and Covered AI Systems under the EU AI Act** (210 words)

> The EU AI Act focuses on regulating AI systems to ensure safety, transparency, and ethical use within the European Union. But which AI systems are covered? The Act applies to AI systems that are placed on the market or put into service in the EU, regardless of where the provider is located. This includes both software and hardware performing automated decision-making or actions.
> 
> Key to understanding scope is how the Act defines "AI systems": broadly, they include software that uses techniques like machine learning, logic- and knowledge-based approaches, or statistical methods to produce outputs such as content, recommendations, or decisions affecting people or environments.
> 
> However, the Act does not cover all AI. For instance, AI used strictly for personal, non-professional activities is exempt. Also, certain sectors have specific rules or exclusions, such as AI used exclusively for military purposes or in some public security contexts.
> 
> **Example:** A company deploying an AI-powered recruitment tool in Europe must comply because it's an AI system offering automated decision-making affecting job applicants. But a hobbyist using AI to organize their personal music collection is outside the Act’s scope.
> 
> Understanding which systems and uses fall under the EU AI Act helps companies identify if they must meet compliance obligations like risk assessment, transparency, and monitoring.

- minor error: "This includes both software and hardware performing automated decision-making or actions.": The EU AI Act primarily regulates AI systems, which are defined as software systems; hardware alone is not covered unless it contains or runs AI software.
Teaches the concept: yes; fits level: yes. The explanation is accurate, well-pitched, and clearly summarizes the scope and definitions under the EU AI Act except for the minor imprecision about hardware being covered.

**Open question**

> Imagine you are a compliance officer at a tech company developing AI-driven healthcare applications. Explain in 2–5 sentences which AI systems your company must ensure compliance for under the EU AI Act, and identify any AI systems or scenarios you think would not fall under the Act’s scope.

Reference answer:
> The company must ensure compliance for AI systems defined as high-risk under the EU AI Act, such as those used in medical diagnostics, patient management, or assisting clinical decisions because these impact health and safety. Examples include AI for disease detection or treatment recommendations. AI systems purely used for administrative tasks or research without immediate patient impact might fall outside the scope or require less stringent compliance. Systems that are strictly excluded, such as those used for military purposes or certain open-source software, would not need compliance.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>sn1-sn2</b>: no issues found</summary>

Topic: Organic chemistry: SN1 vs SN2 reactions

Read as: Understand the fundamental differences between SN1 and SN2 organic reactions and be able to predict which mechanism applies given a particular reaction scenario. (baseline: unknown)

**Plan: SN1 vs SN2 Mechanisms in Organic Chemistry.** Key Features of SN1 and SN2 Reactions → Substrate Structure and Its Effect → Nucleophile Strength and Solvent Effects → Stereochemical Consequences → Predicting Mechanism in Practice

Judge: serves goal yes, order yes; gaps: Leaving group effects. The plan is well-structured and covers almost all essentials, but omits the important role of leaving group ability in determining SN1 vs SN2 pathways.

**Multiple choice** (concept: Key Features of SN1 and SN2 Reactions)

> Which statement correctly distinguishes an SN1 reaction mechanism from an SN2 reaction mechanism?

- ▫️ `a` SN1 reactions occur in one concerted step, while SN2 reactions proceed through two distinct steps.
- ✅ `b` SN1 reactions involve a carbocation intermediate and multiple steps; SN2 reactions proceed in a single concerted step without intermediates.
- ▫️ `c` SN1 reactions are characterized by a strong nucleophile attacking simultaneously as the leaving group leaves.
- ▫️ `d` Both SN1 and SN2 mechanisms are always bimolecular involving two molecules reacting simultaneously.

Judge picked `b`

**Explanation: Key Features of SN1 and SN2 Reactions** (270 words)

> In organic chemistry, nucleophilic substitution reactions happen when a nucleophile replaces a leaving group in a molecule. There are two main types: SN1 and SN2.
> 
> **SN2** stands for bimolecular nucleophilic substitution. It is a one-step, "concerted" process where the nucleophile attacks the substrate at the same time as the leaving group leaves. This means the rate depends on the concentration of both the nucleophile and the substrate. Because it happens simultaneously, the substitution occurs with inversion of stereochemistry at the carbon center (like an umbrella flipping inside out in the wind).
> 
> **SN1** stands for unimolecular nucleophilic substitution. It is a two-step, "stepwise" process. First, the leaving group leaves, forming a carbocation intermediate. Then, the nucleophile attacks this positively charged intermediate. Here, the rate depends only on the substrate concentration because the first step is rate limiting. The intermediate carbocation is planar, so the nucleophile can attack from either side, often resulting in a mixture of stereoisomers.
> 
> **Summary:**
> - SN2: 1 step, simultaneous bond breaking and making, rate depends on nucleophile + substrate, inversion of configuration.
> - SN1: 2 steps, carbocation intermediate, rate depends only on substrate, possible racemization.
> 
> **Worked example:**
> Imagine a reaction where bromomethane (CH3Br) reacts with OH– in water.
> - Would you expect this to be SN1 or SN2?
> - Bromomethane is a primary substrate, which is less stable for carbocation formation.
> - Primary substrates typically react via SN2.
> 
> So here, OH– attacks the carbon while Br leaves simultaneously (SN2), leading to an inversion of configuration if stereochemistry was involved.
> 
> What features of the substrate or conditions might you check next time to decide between SN1 and SN2?

Judge found no factual errors.
Teaches the concept: yes; fits level: yes. The explanation accurately presents the main differences between SN1 and SN2 mechanisms and offers a suitable example for understanding their distinguishing features.

**Open question**

> Explain the key differences between SN1 and SN2 reactions in terms of mechanism steps and molecularity. Given a reaction where a tertiary alkyl halide reacts with a nucleophile in a polar protic solvent, predict whether the reaction proceeds via SN1 or SN2 and justify your answer in 2–5 sentences.

Reference answer:
> SN1 reactions proceed via a two-step mechanism involving first the formation of a carbocation intermediate, so the rate depends on only one molecule (unimolecular). SN2 reactions proceed via a one-step concerted mechanism where the nucleophile attacks as the leaving group leaves, so the rate depends on two molecules (bimolecular). For a tertiary alkyl halide in a polar protic solvent, the reaction typically proceeds via SN1 because the steric hindrance prevents SN2, and the polar solvent stabilizes the carbocation intermediate formed in SN1.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

<details><summary><b>vague-space</b>: major error in explanation</summary>

Topic: stuff about space

Read as: Explore and understand interesting facts and concepts about space broadly, including planets, stars, galaxies, and general space phenomena. (baseline: unknown)

**Plan: Exploring Space: Planets, Stars, and Beyond.** What Is Space? → The Solar System → Types of Celestial Objects → Stars and Their Life Cycles → Galaxies and the Universe → Gravity and Orbits → Fascinating Space Phenomena

Judge: serves goal yes, order yes. The plan covers a broad range of foundational and intriguing space topics in a logical order and matches the learner's broad exploratory goal.

**Multiple choice** (concept: What Is Space?)

> Which of the following best describes what 'space' is, compared to Earth's atmosphere?

- ✅ `a` Space is the region outside Earth's atmosphere where there is nearly no air and a vacuum exists.
- ▫️ `b` Space is just a layer of air that surrounds the Earth, similar to the atmosphere but thinner.
- ▫️ `c` Space is a dense cloud of gases right above Earth's surface.
- ▫️ `d` Space is the ocean of water that exists under the Earth's crust.

Judge picked `a`

**Explanation: What Is Space? Understanding the Vast Expanse Beyond Earth** (247 words)

> Space, often called "outer space," is the immense region beyond Earth's atmosphere where there is almost no matter. Unlike the air we breathe on Earth, space lacks an atmosphere, which means it is mostly a vacuum. This absence of air leads to some unique conditions. For example, because there's almost nothing in space, sound cannot travel there — silence is the rule.
> 
> Another key feature of space is its temperature. Space itself has no temperature because temperature measures how fast particles move, and in a vacuum, there are almost no particles. However, objects in space, like planets or spacecraft, can get very hot or very cold depending on whether they are exposed to the Sun’s rays.
> 
> To help imagine space, think about Earth's atmosphere as a blanket of air protecting the planet. Above that blanket lies the open sky, which becomes darker the higher you go until it leads into the blackness of space.
> 
> **Example:** The International Space Station (ISS) orbits Earth in space around 400 kilometers above us — far above the atmosphere where air is thin to nonexistent. Astronauts on the ISS experience weightlessness because there’s no atmosphere to create the drag that we feel walking on Earth. The vacuum of space means they have to wear special suits to provide air and protection.
> 
> Can you describe, based on this, how space is different from the environment right here on Earth? What might happen if we tried to breathe or make a sound in space?

- major error: "Astronauts on the ISS experience weightlessness because there’s no atmosphere to create the drag that we feel walking on Earth.": Weightlessness on the ISS is due to it being in free-fall (continuous orbit around Earth), not the absence of atmospheric drag; while drag is minimal, it is not what causes weightlessness.
Teaches the concept: yes; fits level: yes. The explanation appropriately conveys the concept, though it contains a major error about the cause of weightlessness.

**Open question**

> Imagine you could explain to a friend what space is and why it is so different from the air we breathe on Earth. In 2-5 sentences, describe what "outer space" means and mention at least two important properties of space that make it unique compared to our atmosphere.

Reference answer:
> Space, or outer space, is the vast area beyond Earth's atmosphere where there is almost no air or matter. Unlike Earth's atmosphere, space is a near vacuum, meaning it has extremely low pressure and very few particles. It also experiences extreme temperatures and lacks breathable air, which are key properties that make it very different from conditions on Earth.

Judge: clear yes, reference correct yes, rubric fits yes

</details>

## Speed and reliability

| Operation | Model | Calls | Median | 90th percentile | Needed a repair | Avg output tokens |
|---|---|---|---|---|---|---|
| evaluate | gpt-4.1-mini | 150 | 1.7 s | 2.1 s | 0 | 233 |
| clarify | gpt-4.1-mini | 20 | 1.6 s | 1.9 s | 0 | 210 |
| compile | gpt-4.1 | 20 | 4.4 s | 4.9 s | 0 | 892 |
| activity | gpt-4.1-mini | 60 | 2.3 s | 2.9 s | 2 | 338 |
