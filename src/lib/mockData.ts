export const MOCK_RECIPES = [
    {
        id: 1,
        title: "Classic Spaghetti Carbonara",
        slug: "spaghetti-carbonara",
        description: "A traditional Italian pasta dish made with eggs, cheese, pancetta, and pepper.",
        imageUrl: "https://images.unsplash.com/photo-1612874742237-9828fa36267e?auto=format&fit=crop&w=800&q=80",
        category: "Dinner",
        nationality: "Italian",
        rating: 4.8,
        views: 120,
        createdAt: new Date('2023-10-01'),
        ingredients: JSON.stringify([
            { amount: "400g", item: "Spaghetti" },
            { amount: "150g", item: "Pancetta" },
            { amount: "4", item: "Large Eggs" },
            { amount: "100g", item: "Pecorino Romano" },
            { amount: "To taste", item: "Black Pepper" }
        ]),
        instructions: `
# Classic Spaghetti Carbonara

This is a classic Roman pasta dish.

## Preparation
1. Bring a large pot of salted water to a boil.
2. Cut the pancetta into small strips.
3. Whisk the eggs and cheese together in a bowl. Season with plenty of black pepper.

## Cooking
1. Cook the pasta until al dente.
2. Meanwhile, fry the pancetta until crisp.
3. Drain the pasta, reserving some cooking water.
4. Add pasta to the pancetta pan (off heat).
5. Pour in the egg mixture and toss quickly to create a creamy sauce. Add pasta water if needed.
6. Serve immediately with more cheese and pepper.
    `
    },
    {
        id: 2,
        title: "Vegan Buddha Bowl",
        slug: "vegan-buddha-bowl",
        description: "Healthy and colorful bowl packed with quinoa, roasted veggies, and tahini dressing.",
        imageUrl: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80",
        category: "Lunch",
        nationality: "Global",
        rating: 4.5,
        views: 85,
        createdAt: new Date('2023-10-05'),
        ingredients: JSON.stringify([
            { amount: "1 cup", item: "Quinoa" },
            { amount: "1", item: "Sweet Potato" },
            { amount: "1 can", item: "Chickpeas" },
            { amount: "1 bunch", item: "Kale" },
            { amount: "2 tbsp", item: "Tahini" }
        ]),
        instructions: `
# Vegan Buddha Bowl

## Instructions
1. Cook quinoa according to package instructions.
2. Roast sweet potato cubes and chickpeas at 200°C for 25 mins.
3. Massage kale with olive oil and lemon.
4. Whisk tahini, lemon juice, maple syrup, and water for the dressing.
5. Assemble bowls and drizzle with dressing.
    `
    },
    {
        id: 3,
        title: "German Schnitzel",
        slug: "german-schnitzel",
        description: "Crispy breaded pork cutlet served with lemon and potato salad.",
        imageUrl: "https://images.unsplash.com/photo-1599921841143-819065a55cc6?auto=format&fit=crop&w=800&q=80",
        category: "Dinner",
        nationality: "German",
        rating: 4.9,
        views: 200,
        createdAt: new Date('2023-09-20'),
        ingredients: JSON.stringify([
            { amount: "4", item: "Pork Cutlets" },
            { amount: "2", item: "Eggs" },
            { amount: "1 cup", item: "Flour" },
            { amount: "2 cups", item: "Breadcrumbs" },
            { amount: "To fry", item: "Butter or Oil" }
        ]),
        instructions: `
# German Schnitzel

## Instructions
1. Pound the pork cutlets until thin.
2. Set up a breading station: flour, beaten eggs, breadcrumbs.
3. Dredge each cutlet in flour, then egg, then breadcrumbs.
4. Fry in plenty of butter or oil until golden brown.
5. Serve with lemon wedges.
    `
    }
];
