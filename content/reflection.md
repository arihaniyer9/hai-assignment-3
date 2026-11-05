# One Label Is Not a Feeling: What a Tweet-Labeling Task Shows About Emotion AI

> Reflection for the bonus task, based on the two assigned readings (Andalibi & Buss, 2020; Stark & Hoey, 2021) and on taking the labeling task myself.

Building a task in which people label tweets with one of six emotions made me doubt the premise behind emotion AI. My position is that inferring a person's emotions from data is a questionable use of AI, and that it is hard to defend once the output is used to make decisions about an individual. It can be defended, at most, when it is aggregate, transparent, opt-in and overseen by people.

When I took the task myself, my labels matched the dataset on only one of five tweets, and I chose "None of these / Unsure" twice. That was not carelessness. The dataset labels "i feel just complain that companies are becoming too rich because of the taxes imposed upon them" as joy, and "i feel greedy about wanting to see this film series continue" as anger; I can argue for other readings of both. Even the label set is a choice: the dataset has love but no disgust, which differs from the six "basic" emotions (anger, disgust, fear, joy, sadness, surprise) that Andalibi and Buss (2020) attribute to Ekman. The dataset's documentation also lists its labels as machine-generated, not chosen by people reading each tweet. Here, "ground truth" is a convention, not a fact.

Stark and Hoey (2021) make this point systematically. Emotion AI rests on competing theories of what emotions are (motivational, evaluative, experiential and hybrid) and on different proxy data such as faces, voices, behavior and text, and they argue we should not take developers at their word that these produce ground truth. Basic Emotion Theory, the most common foundation, treats emotional expression as universal and legible, yet the critics they cite find facial movements far more variable and context-dependent than that view allows. Text is not a clean escape either: such systems can map patterns in language but have no capacity to understand the motivation behind a text. They add that such models are prescriptive as well as descriptive, since people adjust themselves to fit the metric, and that patterns found in aggregate are wrongly applied to individuals (the ecological fallacy). Their conclusion is that the lack of scientific consensus may be disqualifying.

Andalibi and Buss (2020) show how this looks to the people being analyzed. Most of their 13 interviewees found emotion recognition invasive or scary and described emotions as intimate, vulnerable and hard to define even for the person feeling them: "It's not just like people are happy or sad or angry. There's a million things in between." They anticipated manipulation, unequal harm to people in vulnerable states, feedback loops that worsen mental health, misrepresentation and no one to hold accountable, and many said they would post less or leave the platform. The sample is small and not representative, but the concerns line up with Stark and Hoey's: the harms fall on people who were never consulted.

The strongest counterargument is that emotion-aware systems can help. Andalibi and Buss note emotional-support agents and tools for people on the autism spectrum, and prior work they review found people more comfortable with aggregate monitoring of depression on Twitter than with individual assessment. I accept that difference. But good intentions do not remove the validity problem: a system can be well meant and still be wrong about a person in ways that matter.

For designers, this suggests treating emotional data as sensitive, making any inference opt-in and visible, showing uncertainty instead of a single label, keeping people in the loop, and not acting on individual inferences. My study tried a small version of this: an "Unsure" option, a confidence rating, and a debrief that says "differs" rather than "wrong." As Andalibi and Buss conclude, acknowledging emotional complexity does not mean building more accurate technology; it means prioritizing the preferences and values of the people affected. Labeling tweets convinced me that the problem is not only accuracy. One label is not a feeling.

## References

Andalibi, N., & Buss, J. (2020). The human in emotion recognition on social media: Attitudes, outcomes, risks. In *Proceedings of the 2020 CHI Conference on Human Factors in Computing Systems*. ACM. [https://doi.org/10.1145/3313831.3376680](https://doi.org/10.1145/3313831.3376680)

Saravia, E., Liu, H.-C. T., Huang, Y.-H., Wu, J., & Chen, Y.-S. (2018). CARER: Contextualized affect representations for emotion recognition. In *Proceedings of the 2018 Conference on Empirical Methods in Natural Language Processing (EMNLP)*.

Stark, L., & Hoey, J. (2021). The ethics of emotion in artificial intelligence systems. In *Proceedings of the 2021 ACM Conference on Fairness, Accountability, and Transparency (FAccT '21)*. ACM. [https://doi.org/10.1145/3442188.3445939](https://doi.org/10.1145/3442188.3445939)

## AI use disclosure

For the essay, AI was used to brainstorm themes and correct the grammatical mistakes from the written essay. The essay's observations about the author's own run of the labeling task come from the study the author ran.
