// Sample .hasm model datasets for live 3D visualization.
// Each model models exactly 1 PERSON, 6 EXPERIENCEs, 22 FACTs and 6 LINKs so the
// demo satisfies the minimum example shape (>=1 PERSON, >5 EXPERIENCE, >20 FACT, >5 LINK)
// and renders identically wherever this folder is copied.
export const SAMPLE_HASM_MODELS = [
  {
    fileName: "MarieCurieResearch.hasm",
    title: "Marie Curie Research Model (Europe)",
    model: {
      people: [
        { person_id: "mc1", person_name: "Marie Curie", birthday: "1867-11-07", deathday: "1934-07-04" }
      ],
      experiences: [
        { experience_id: "mce1", experience_name: "Life (1867-11-07 - 1934-07-04)", parent_experience_ids: [] },
        { experience_id: "mce2", experience_name: "Early Education in Warsaw & Paris", parent_experience_ids: ["mce1"] },
        { experience_id: "mce3", experience_name: "Discovery of Radioactivity & New Elements", parent_experience_ids: ["mce1", "mce2"] },
        { experience_id: "mce4", experience_name: "Nobel Prize Recognition", parent_experience_ids: ["mce1", "mce3"] },
        { experience_id: "mce5", experience_name: "World War I Mobile X-ray Units", parent_experience_ids: ["mce1"] },
        { experience_id: "mce6", experience_name: "Founding the Radium Institute", parent_experience_ids: ["mce1", "mce3"] }
      ],
      facts: [
        { fact_id: "mcf1", fact_name: "Born in Warsaw, Congress Poland", occurred_at: "1867-11-07", experience_ids: ["mce2"] },
        { fact_id: "mcf2", fact_name: "Graduated secondary school with a gold medal", occurred_at: "1883-06-12", experience_ids: ["mce2"] },
        { fact_id: "mcf3", fact_name: "Worked as a governess to fund her sister's studies", occurred_at: "1886-01-01", experience_ids: ["mce2"] },
        { fact_id: "mcf4", fact_name: "Moved to Paris and enrolled at the Sorbonne", occurred_at: "1891-11-03", experience_ids: ["mce2"] },
        { fact_id: "mcf5", fact_name: "Earned degree in physics", occurred_at: "1893-07-28", experience_ids: ["mce2"] },
        { fact_id: "mcf6", fact_name: "Earned degree in mathematics", occurred_at: "1894-07-28", experience_ids: ["mce2"] },
        { fact_id: "mcf7", fact_name: "Met Pierre Curie", occurred_at: "1894-04-01", experience_ids: ["mce2"] },
        { fact_id: "mcf8", fact_name: "Married Pierre Curie", occurred_at: "1895-07-26", experience_ids: ["mce2"] },
        { fact_id: "mcf9", fact_name: "Began research on uranium rays", occurred_at: "1897-01-01", experience_ids: ["mce3"] },
        { fact_id: "mcf10", fact_name: "Coined the term \"radioactivity\"", occurred_at: "1898-04-12", experience_ids: ["mce3"] },
        { fact_id: "mcf11", fact_name: "Discovered polonium", occurred_at: "1898-07-18", experience_ids: ["mce3"] },
        { fact_id: "mcf12", fact_name: "Discovered radium", occurred_at: "1898-12-26", experience_ids: ["mce3"] },
        { fact_id: "mcf13", fact_name: "Awarded her doctorate in physics", occurred_at: "1903-06-25", experience_ids: ["mce3"] },
        { fact_id: "mcf14", fact_name: "Awarded the Nobel Prize in Physics", occurred_at: "1903-12-10", experience_ids: ["mce4"] },
        { fact_id: "mcf15", fact_name: "Death of Pierre Curie in a street accident", occurred_at: "1906-04-19", experience_ids: ["mce1"] },
        { fact_id: "mcf16", fact_name: "Became the first female professor at the Sorbonne", occurred_at: "1906-05-13", experience_ids: ["mce3"] },
        { fact_id: "mcf17", fact_name: "Isolated pure metallic radium", occurred_at: "1910-01-01", experience_ids: ["mce3"] },
        { fact_id: "mcf18", fact_name: "Awarded the Nobel Prize in Chemistry", occurred_at: "1911-12-10", experience_ids: ["mce4"] },
        { fact_id: "mcf19", fact_name: "Founded the Radium Institute in Paris", occurred_at: "1914-07-01", experience_ids: ["mce6"] },
        { fact_id: "mcf20", fact_name: "Developed mobile X-ray units, the \"Little Curies\"", occurred_at: "1914-08-01", experience_ids: ["mce5"] },
        { fact_id: "mcf21", fact_name: "Directed the Red Cross Radiology Service", occurred_at: "1916-01-01", experience_ids: ["mce5"] },
        { fact_id: "mcf22", fact_name: "Died of aplastic anemia from radiation exposure", occurred_at: "1934-07-04", experience_ids: ["mce1"] }
      ],
      links: [
        { link_id: "mcl1", link_name: "Collaborated With Pierre Curie", link_type: "relationship", related_ids: ["mc1", "mce3"] },
        { link_id: "mcl2", link_name: "Advanced Nuclear Physics", link_type: "breakthrough", related_ids: ["mcf11", "mcf12"] },
        { link_id: "mcl3", link_name: "Founded Radium Institute", link_type: "achievement", related_ids: ["mcf19", "mce6"] },
        { link_id: "mcl4", link_name: "Raised Irène and Ève Curie", link_type: "relationship", related_ids: ["mce2", "mce6"] },
        { link_id: "mcl5", link_name: "Corresponded With Albert Einstein", link_type: "relationship", related_ids: ["mc1", "mcf16"] },
        { link_id: "mcl6", link_name: "Built on Henri Becquerel's Uranium Research", link_type: "influence", related_ids: ["mcf9", "mcf10"] }
      ]
    }
  },
  {
    fileName: "AbrahamLincolnLeadership.hasm",
    title: "Abraham Lincoln Leadership Model (United States)",
    model: {
      people: [
        { person_id: "al1", person_name: "Abraham Lincoln", birthday: "1809-02-12", deathday: "1865-04-15" }
      ],
      experiences: [
        { experience_id: "ale1", experience_name: "Life (1809-02-12 - 1865-04-15)", parent_experience_ids: [] },
        { experience_id: "ale2", experience_name: "Frontier Youth & Self-Education", parent_experience_ids: ["ale1"] },
        { experience_id: "ale3", experience_name: "Legal & Political Career in Illinois", parent_experience_ids: ["ale1", "ale2"] },
        { experience_id: "ale4", experience_name: "Presidency & Civil War Leadership", parent_experience_ids: ["ale1", "ale3"] },
        { experience_id: "ale5", experience_name: "Emancipation & Constitutional Reform", parent_experience_ids: ["ale1", "ale4"] },
        { experience_id: "ale6", experience_name: "Assassination & National Mourning", parent_experience_ids: ["ale1", "ale4"] }
      ],
      facts: [
        { fact_id: "alf1", fact_name: "Born in a log cabin, Hardin County, Kentucky", occurred_at: "1809-02-12", experience_ids: ["ale2"] },
        { fact_id: "alf2", fact_name: "Family relocated to Indiana", occurred_at: "1816-12-01", experience_ids: ["ale2"] },
        { fact_id: "alf3", fact_name: "Mother Nancy Hanks Lincoln died", occurred_at: "1818-10-05", experience_ids: ["ale2"] },
        { fact_id: "alf4", fact_name: "Family relocated to Illinois", occurred_at: "1830-03-01", experience_ids: ["ale2"] },
        { fact_id: "alf5", fact_name: "Served in the Illinois militia during the Black Hawk War", occurred_at: "1832-04-21", experience_ids: ["ale2"] },
        { fact_id: "alf6", fact_name: "Elected to the Illinois General Assembly", occurred_at: "1834-08-04", experience_ids: ["ale3"] },
        { fact_id: "alf7", fact_name: "Admitted to the Illinois bar", occurred_at: "1836-09-09", experience_ids: ["ale3"] },
        { fact_id: "alf8", fact_name: "Married Mary Todd", occurred_at: "1842-11-04", experience_ids: ["ale3"] },
        { fact_id: "alf9", fact_name: "Elected to the U.S. House of Representatives", occurred_at: "1846-08-03", experience_ids: ["ale3"] },
        { fact_id: "alf10", fact_name: "Delivered the \"House Divided\" speech", occurred_at: "1858-06-16", experience_ids: ["ale3"] },
        { fact_id: "alf11", fact_name: "Concluded the Lincoln-Douglas debates", occurred_at: "1858-10-15", experience_ids: ["ale3"] },
        { fact_id: "alf12", fact_name: "Elected 16th President of the United States", occurred_at: "1860-11-06", experience_ids: ["ale4"] },
        { fact_id: "alf13", fact_name: "Inaugurated as President", occurred_at: "1861-03-04", experience_ids: ["ale4"] },
        { fact_id: "alf14", fact_name: "Confederate forces attacked Fort Sumter", occurred_at: "1861-04-12", experience_ids: ["ale4"] },
        { fact_id: "alf15", fact_name: "Issued the preliminary Emancipation Proclamation", occurred_at: "1862-09-22", experience_ids: ["ale5"] },
        { fact_id: "alf16", fact_name: "Emancipation Proclamation took effect", occurred_at: "1863-01-01", experience_ids: ["ale5"] },
        { fact_id: "alf17", fact_name: "Delivered the Gettysburg Address", occurred_at: "1863-11-19", experience_ids: ["ale4"] },
        { fact_id: "alf18", fact_name: "Re-elected as President", occurred_at: "1864-11-08", experience_ids: ["ale4"] },
        { fact_id: "alf19", fact_name: "Advocated passage of the 13th Amendment", occurred_at: "1865-01-31", experience_ids: ["ale5"] },
        { fact_id: "alf20", fact_name: "Accepted Confederate surrender at Appomattox", occurred_at: "1865-04-09", experience_ids: ["ale4"] },
        { fact_id: "alf21", fact_name: "Shot at Ford's Theatre by John Wilkes Booth", occurred_at: "1865-04-14", experience_ids: ["ale6"] },
        { fact_id: "alf22", fact_name: "Died from his wounds", occurred_at: "1865-04-15", experience_ids: ["ale6"] }
      ],
      links: [
        { link_id: "all1", link_name: "Debated Stephen Douglas", link_type: "relationship", related_ids: ["alf10", "alf11"] },
        { link_id: "all2", link_name: "Issued Emancipation Proclamation", link_type: "achievement", related_ids: ["alf16", "ale5"] },
        { link_id: "all3", link_name: "Led the Union Through Civil War", link_type: "breakthrough", related_ids: ["al1", "ale4"] },
        { link_id: "all4", link_name: "Appointed William Seward Secretary of State", link_type: "relationship", related_ids: ["al1", "alf13"] },
        { link_id: "all5", link_name: "Opposed by Confederacy Under Jefferson Davis", link_type: "relationship", related_ids: ["alf14", "alf20"] },
        { link_id: "all6", link_name: "Supported by Abolitionist Frederick Douglass", link_type: "relationship", related_ids: ["ale3", "ale4"] }
      ]
    }
  },
  {
    fileName: "TokugawaIeyasuUnification.hasm",
    title: "Tokugawa Ieyasu Unification Model (Japan)",
    model: {
      people: [
        { person_id: "ti1", person_name: "Tokugawa Ieyasu", birthday: "1543-01-31", deathday: "1616-06-01" }
      ],
      experiences: [
        { experience_id: "tie1", experience_name: "Life (1543-01-31 - 1616-06-01)", parent_experience_ids: [] },
        { experience_id: "tie2", experience_name: "Hostage Years & Early Alliances", parent_experience_ids: ["tie1"] },
        { experience_id: "tie3", experience_name: "Rise as Daimyo of Mikawa & Kanto", parent_experience_ids: ["tie1", "tie2"] },
        { experience_id: "tie4", experience_name: "Sekigahara Campaign & Unification", parent_experience_ids: ["tie1", "tie3"] },
        { experience_id: "tie5", experience_name: "Founding the Tokugawa Shogunate", parent_experience_ids: ["tie1", "tie4"] },
        { experience_id: "tie6", experience_name: "Retirement as Ogosho & Final Campaigns", parent_experience_ids: ["tie1", "tie5"] }
      ],
      facts: [
        { fact_id: "tif1", fact_name: "Born at Okazaki Castle, Mikawa Province", occurred_at: "1543-01-31", experience_ids: ["tie2"] },
        { fact_id: "tif2", fact_name: "Sent as a hostage to the Imagawa clan", occurred_at: "1549-01-01", experience_ids: ["tie2"] },
        { fact_id: "tif3", fact_name: "Formed an alliance with Oda Nobunaga", occurred_at: "1562-01-01", experience_ids: ["tie2"] },
        { fact_id: "tif4", fact_name: "Took control of Mikawa Province", occurred_at: "1566-01-01", experience_ids: ["tie3"] },
        { fact_id: "tif5", fact_name: "Fought at the Battle of Mikatagahara", occurred_at: "1573-01-25", experience_ids: ["tie3"] },
        { fact_id: "tif6", fact_name: "Allied forces defeated the Takeda clan at Nagashino", occurred_at: "1575-06-28", experience_ids: ["tie3"] },
        { fact_id: "tif7", fact_name: "Received the Kanto region from Toyotomi Hideyoshi", occurred_at: "1590-08-01", experience_ids: ["tie3"] },
        { fact_id: "tif8", fact_name: "Established his castle town at Edo", occurred_at: "1590-09-01", experience_ids: ["tie3"] },
        { fact_id: "tif9", fact_name: "Became guardian regent after Hideyoshi's death", occurred_at: "1598-09-18", experience_ids: ["tie3"] },
        { fact_id: "tif10", fact_name: "Won the decisive Battle of Sekigahara", occurred_at: "1600-10-21", experience_ids: ["tie4"] },
        { fact_id: "tif11", fact_name: "Appointed Shogun by the Emperor", occurred_at: "1603-03-24", experience_ids: ["tie5"] },
        { fact_id: "tif12", fact_name: "Established the Tokugawa shogunate government in Edo", occurred_at: "1603-04-01", experience_ids: ["tie5"] },
        { fact_id: "tif13", fact_name: "Retired the title of Shogun to his son Hidetada", occurred_at: "1605-05-01", experience_ids: ["tie6"] },
        { fact_id: "tif14", fact_name: "Took the title of Ogosho, the retired ruler", occurred_at: "1605-06-01", experience_ids: ["tie6"] },
        { fact_id: "tif15", fact_name: "Issued regulations governing daimyo households", occurred_at: "1611-01-01", experience_ids: ["tie5"] },
        { fact_id: "tif16", fact_name: "Began the Winter Siege of Osaka Castle", occurred_at: "1614-12-01", experience_ids: ["tie6"] },
        { fact_id: "tif17", fact_name: "Ended the Toyotomi clan in the Summer Siege of Osaka", occurred_at: "1615-06-04", experience_ids: ["tie6"] },
        { fact_id: "tif18", fact_name: "Issued the Buke Shohatto code for samurai households", occurred_at: "1615-07-07", experience_ids: ["tie5"] },
        { fact_id: "tif19", fact_name: "Fell ill following a hawking excursion", occurred_at: "1616-01-21", experience_ids: ["tie6"] },
        { fact_id: "tif20", fact_name: "Died at Sunpu Castle", occurred_at: "1616-06-01", experience_ids: ["tie1"] },
        { fact_id: "tif21", fact_name: "Deified posthumously as Tosho Daigongen", occurred_at: "1617-04-01", experience_ids: ["tie6"] },
        { fact_id: "tif22", fact_name: "Enshrined at Nikko Toshogu shrine", occurred_at: "1617-04-17", experience_ids: ["tie6"] }
      ],
      links: [
        { link_id: "til1", link_name: "Allied With Oda Nobunaga", link_type: "relationship", related_ids: ["tif3", "tif6"] },
        { link_id: "til2", link_name: "Won the Battle of Sekigahara", link_type: "breakthrough", related_ids: ["tif10", "tie4"] },
        { link_id: "til3", link_name: "Founded the Edo Shogunate", link_type: "achievement", related_ids: ["tie3", "tie4"] },
        { link_id: "til4", link_name: "Succeeded by His Son Hidetada", link_type: "relationship", related_ids: ["ti1", "tif13"] },
        { link_id: "til5", link_name: "Rivaled Toyotomi Hideyori", link_type: "relationship", related_ids: ["tif16", "tif17"] },
        { link_id: "til6", link_name: "Advised by the Monk Ishin Suden", link_type: "relationship", related_ids: ["ti1", "tie6"] }
      ]
    }
  },
  {
    fileName: "SunYatSenRevolution.hasm",
    title: "Sun Yat-sen Revolution Model (China)",
    model: {
      people: [
        { person_id: "sy1", person_name: "Sun Yat-sen", birthday: "1866-11-12", deathday: "1925-03-12" }
      ],
      experiences: [
        { experience_id: "sye1", experience_name: "Life (1866-11-12 - 1925-03-12)", parent_experience_ids: [] },
        { experience_id: "sye2", experience_name: "Medical Studies & Early Reform Ideas", parent_experience_ids: ["sye1"] },
        { experience_id: "sye3", experience_name: "Revolutionary Organizing in Exile", parent_experience_ids: ["sye1", "sye2"] },
        { experience_id: "sye4", experience_name: "Xinhai Revolution & Founding the Republic", parent_experience_ids: ["sye1", "sye3"] },
        { experience_id: "sye5", experience_name: "Three Principles of the People", parent_experience_ids: ["sye1", "sye3"] },
        { experience_id: "sye6", experience_name: "Reorganizing the Kuomintang", parent_experience_ids: ["sye1", "sye4"] }
      ],
      facts: [
        { fact_id: "syf1", fact_name: "Born in Cuiheng village, Guangdong", occurred_at: "1866-11-12", experience_ids: ["sye2"] },
        { fact_id: "syf2", fact_name: "Traveled to Honolulu to study", occurred_at: "1879-01-01", experience_ids: ["sye2"] },
        { fact_id: "syf3", fact_name: "Enrolled at the Hong Kong College of Medicine", occurred_at: "1887-01-01", experience_ids: ["sye2"] },
        { fact_id: "syf4", fact_name: "Graduated as a licensed physician", occurred_at: "1892-07-23", experience_ids: ["sye2"] },
        { fact_id: "syf5", fact_name: "Founded the Revive China Society", occurred_at: "1894-11-24", experience_ids: ["sye3"] },
        { fact_id: "syf6", fact_name: "First Guangzhou Uprising attempt failed", occurred_at: "1895-10-26", experience_ids: ["sye3"] },
        { fact_id: "syf7", fact_name: "Held at the Chinese legation in London", occurred_at: "1896-10-11", experience_ids: ["sye3"] },
        { fact_id: "syf8", fact_name: "Formed the Tongmenghui revolutionary alliance in Tokyo", occurred_at: "1905-08-20", experience_ids: ["sye3"] },
        { fact_id: "syf9", fact_name: "Published the Three Principles of the People doctrine", occurred_at: "1905-11-26", experience_ids: ["sye5"] },
        { fact_id: "syf10", fact_name: "Organized the Huanggang uprising in Guangdong", occurred_at: "1907-05-22", experience_ids: ["sye3"] },
        { fact_id: "syf11", fact_name: "Wuchang Uprising ignited the Xinhai Revolution", occurred_at: "1911-10-10", experience_ids: ["sye4"] },
        { fact_id: "syf12", fact_name: "Returned to China from an overseas fundraising tour", occurred_at: "1911-12-25", experience_ids: ["sye4"] },
        { fact_id: "syf13", fact_name: "Inaugurated as Provisional President of the Republic of China", occurred_at: "1912-01-01", experience_ids: ["sye4"] },
        { fact_id: "syf14", fact_name: "Resigned the presidency to Yuan Shikai for national unity", occurred_at: "1912-02-13", experience_ids: ["sye4"] },
        { fact_id: "syf15", fact_name: "Founded the Kuomintang political party", occurred_at: "1912-08-25", experience_ids: ["sye4"] },
        { fact_id: "syf16", fact_name: "Launched the Second Revolution against Yuan Shikai", occurred_at: "1913-07-12", experience_ids: ["sye4"] },
        { fact_id: "syf17", fact_name: "Established a military government in Guangzhou", occurred_at: "1917-09-01", experience_ids: ["sye6"] },
        { fact_id: "syf18", fact_name: "Reorganized the Kuomintang with Soviet assistance", occurred_at: "1924-01-20", experience_ids: ["sye6"] },
        { fact_id: "syf19", fact_name: "Delivered his lectures on the Three Principles of the People", occurred_at: "1924-01-27", experience_ids: ["sye5"] },
        { fact_id: "syf20", fact_name: "Founded the Whampoa Military Academy", occurred_at: "1924-06-16", experience_ids: ["sye6"] },
        { fact_id: "syf21", fact_name: "Traveled north to negotiate national unity", occurred_at: "1924-11-13", experience_ids: ["sye6"] },
        { fact_id: "syf22", fact_name: "Died of liver cancer in Beijing", occurred_at: "1925-03-12", experience_ids: ["sye1"] }
      ],
      links: [
        { link_id: "syl1", link_name: "Founded the Tongmenghui Alliance", link_type: "relationship", related_ids: ["syf5", "syf8"] },
        { link_id: "syl2", link_name: "Led the Xinhai Revolution", link_type: "breakthrough", related_ids: ["syf11", "sye4"] },
        { link_id: "syl3", link_name: "Authored the Three Principles", link_type: "achievement", related_ids: ["sye3", "sye4"] },
        { link_id: "syl4", link_name: "Succeeded by Chiang Kai-shek", link_type: "relationship", related_ids: ["sy1", "syf22"] },
        { link_id: "syl5", link_name: "Supported by Soviet Advisor Mikhail Borodin", link_type: "relationship", related_ids: ["syf17", "syf18"] },
        { link_id: "syl6", link_name: "Married Soong Ching-ling", link_type: "relationship", related_ids: ["sy1", "sye6"] }
      ]
    }
  }
];
