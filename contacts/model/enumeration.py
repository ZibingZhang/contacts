"""Various enumerations."""

import enum
import functools


class Country(enum.StrEnum):
    IRELAND = "Ireland"
    UNITED_STATES = "United States"

    @staticmethod
    @functools.cache
    def values() -> list[str]:
        return [item for item in Country]


class CountryCode(enum.IntEnum):
    NANP = 1
    PORTUGAL = 351
    IRELAND = 353
    CROATIA = 385
    UNITED_KINGDOM = 44
    BELGIUM = 32
    SWEDEN = 46
    BRAZIL = 55
    CHILE = 56
    MALAYSIA = 60
    MEXICO = 52
    HONG_KONG = 852
    CHINA = 86
    TAIWAN = 886

    @staticmethod
    @functools.cache
    def values() -> list[int]:
        return [item for item in CountryCode]


class HighSchoolName(enum.StrEnum):
    ACTON_BOXBOROUGH_REGIONAL_HIGH_SCHOOL = "Acton-Boxborough Regional High School"
    ADVANCED_MATH_AND_SCIENCE_ACADECY_CHARTER_SCHOOL = (
        "Advanced Math and Science Academy Charter School"
    )
    BELMONT_HILL_SCHOOL = "Belmont Hill School"
    BRIMMER_AND_MAY_SCHOOL = "Brimmer and May School"
    BROOKLINE_HIGH_SCHOOL = "Brookline High School"
    BOSTON_UNIVERSITY_ACADEMY = "Boston University Academy"
    BURLINGTON_HIGH_SCHOOL = "Burlington High School"
    CATHOLIC_MEMORIAL = "Catholic Memorial"
    CHAPIN_SCHOOL = "Chapin School"
    COLCHESTER_HIGH_SCHOOL = "Colchester High School"
    COLUMBIA_HIGH_SCHOOL = "Columbia High School"
    CONCORD_CARLISLE_REGIONAL_HIGH_SCHOOL = "Concord-Carlisle Regional High School"
    DANA_HALL_SCHOOL = "Dana Hall School"
    DEXTER_SOUTHFIELD_SCHOOL = "Dexter Southfield School"
    DOVER_SHERBORN_HIGH_SCHOOL = "Dover-Sherborn High School"
    FONTBONNE_ACADEMY = "Fontbonne Academy"
    LEXINGTON_HIGH_SCHOOL = "Lexington High School"
    LINCOLN_SUDBURY_REGIONAL_HIGH_SCHOOL = "Lincoln-Sudbury Regional High School"
    MALDEN_HIGH_SCHOOL = "Malden High School"
    MILTON_ACADEMY = "Milton Academy"
    NATICK_HIGH_SCHOOL = "Natick High School"
    NEEDHAM_HIGH_SCHOOL = "Needham High School"
    NEWTON_NORTH_HIGH_SCHOOL = "Newton North High School"
    NEWTON_SOUTH_HIGH_SCHOOL = "Newton South High School"
    NIGHTINGALE_BAMFORD_SHCOOL = "Nightingale-Bamford School"
    NOBLE_AND_GREENOUGH_SCHOOL = "Noble and Greenough School"
    PHILLIPS_ACADEMY = "Phillips Academy"
    RIVERS_SCHOOL = "Rivers School"
    ROXBURY_LATIN_SCHOOL = "Roxbury Latin School"
    SPENCE_SCHOOL = "Spence School"
    TRINITY_SCHOOL = "Trinity School"
    URSULINE_ACADEmY = "Ursuline Academy"
    WALPOLE_HIGH_SCHOOL = "Walpole High School"
    WAYLAND_HIGH_SCHOOL = "Wayland High School"
    WELLESLEY_HIGH_SCHOOL = "Wellesley High School"
    WESTON_HIGH_SCHOOL = "Weston High School"
    WESTWOOD_HIGH_SCHOOL = "Westwood High School"
    WINCHESTER_HIGH_SCHOOL = "Winchester High School"
    WINSOR_SCHOOL = "Winsor School"

    @staticmethod
    @functools.cache
    def values() -> list[str]:
        return [item for item in HighSchoolName]


class UniversityName(enum.StrEnum):
    AMERICAN_UNIVERSITY = "American University"
    AMHERST_COLLEGE = "Amherst College"
    BABSON_COLLEGE = "Babson College"
    BARD_COLLEGE = "Bard College"
    BATES_COLLEGE = "Bates College"
    BENTLEY_UNIVERSITY = "Bentley University"
    BERKLEE_COLLEGE_OF_MUSIC = "Berklee College of Music"
    BINGHAMTON_UNIVERSITY = "Binghamton University"
    BOSTON_COLLEGE = "Boston College"
    BOSTON_UNIVERSITY = "Boston University"
    BRANDEIS_UNIVERSITY = "Brandeis University"
    BROWN_UNIVERSITY = "Brown University"
    BROWN_UNIVERSITY_AND_RHODE_ISLAND_SCHOOL_OF_DESIGN = (
        "Brown University / Rhode Island School of Design"
    )
    BUCKNELL_UNIVERSITY = "Bucknell University"
    CALIFORNIA_INSTITUTE_OF_TECHNOLOGY = "California Institute of Technology"
    CARLETON_COLLEGE = "Carleton College"
    CARNEGIE_MELLON_UNIVERSITY = "Carnegie Mellon University"
    CASE_WESTERN_RESERVE_UNIVERSITY = "Case Western Reserve University"
    CLEMSON_UNIVERSITY = "Clemson University"
    COLBY_COLLEGE = "Colby College"
    COLBY_UNIVERSITY = "Colby University"
    COLGATE_UNIVERSITY = "Colgate University"
    COLLEGE_OF_THE_HOLY_CROSS = "College of the Holy Cross"
    COLUMBIA_UNIVERSITY = "Columbia University"
    CONNECTICUT_COLLEGE = "Connecticut College"
    CORNELL_UNIVERSITY = "Cornell University"
    DANMARKS_TEKNISKE_UNIVERSITET = "Danmarks Tekniske Universitet"
    DARTMOUTH_COLLEGE = "Dartmouth College"
    DREXEL_UNIVERSITY = "Drexel University"
    DUKE_UNIVERSITY = "Duke University"
    ELON_UNIVERSITY = "Elon University"
    EMORY_UNIVERSITY = "Emory University"
    ENDICOTT_COLLEGE = "Endicott College"
    FAIRFIELD_UNIVERSITY = "Fairfield University"
    FORDHAM_UNIVERSITY = "Fordham University"
    GEORGE_WASHINGTON_UNIVERSITY = "George Washington University"
    GEORGETOWN_UNIVERSITY = "Georgetown University"
    GEORGIA_INSTITUTE_OF_TECHNOLOGY = "Georgia Institute of Technology"
    HAMILTON_COLLEGE = "Hamilton College"
    HARVARD_UNIVERSITY = "Harvard University"
    HAVERFORD_COLLEGE = "Haverford College"
    HOFSTRA_UNIVERSITY = "Hofstra University"
    INDIANA_UNIVERSITY = "Indiana University"
    IOWA_STATE_UNIVERSITY = "Iowa State University"
    ITHACA_COLLEGE = "Ithaca College"
    JOHN_CARROLL_UNIVERSITY = "John Carroll University"
    JOHNS_HOPKINS_UNIVERSITY = "Johns Hopkins University"
    KEENE_STATE_COLLEGE = "Keene State College"
    KENYON_COLLEGE = "Kenyon College"
    LEHIGH_UNIVERSITY = "Lehigh University"
    MACALESTER_UNIVERSITY = "Macalester University"
    MANHATTAN_COLLEGE = "Manhattan College"
    MASSACHUSETTS_COLLEGE_OF_ART_AND_DESIGN = "Massachusetts College of Art and Design"
    MASSACHUSETTS_INSTITUTE_OF_TECHNOLOGY = "Massachusetts Institute of Technology"
    MAYNOOTH_UNIVERSITY = "Maynooth University"
    MCGILL_UNIVERSITY = "McGill University"
    MIDDLEBURY_COLLEGE = "Middlebury College"
    MITCHELL_COLLEGE = "Mitchell College"
    NEW_YORK_UNIVERSITY = "New York University"
    NORTH_CAROLINA_STATE_UNIVERSITY = "North Carolina State University"
    NORTHEASTERN_UNIVERSITY = "Northeastern University"
    NORTHEASTERN_UNIVERSITY_AND_CORNELL_UNIVERSITY = (
        "Northeastern University / Cornell University"
    )
    NORTHWESTERN_UNIVERSITY = "Northwestern University"
    OHIO_STATE_UNIVERSITY = "Ohio State University"
    POMONA_COLLEGE = "Pomona College"
    PRINCETON_UNIVERSITY = "Princeton University"
    PROVIDENCE_COLLEGE = "Providence College"
    PURDUE_UNIVERSITY = "Purdue University"
    QINGDAO_UNIVERSITY = "Qingdao University"
    QUINNIPIAC_UNIVERSITY = "Quinnipiac University"
    REGIS_COLLEGE = "Regis College"
    RENSSELAER_POLYTECHNIC_INSTITUTE = "Rensselaer Polytechnic Institute"
    RUTGERS_UNIVERSITY = "Rutgers University"
    SACRED_HEART_UNIVERSITY = "Sacred Heart University"
    SAINT_MICHAELS_COLLEGE = "Saint Michael's College"
    SAN_DIEGO_STATE_UNIVERSITY = "San Diego State University"
    SETON_HALL_UNIVERSITY = "Seton Hall University"
    SKIDMORE_COLLEGE = "Skidmore College"
    SMITH_COLLEGE = "Smith College"
    SOUTHERN_CONNECTICUT_STATE_UNIVERSITY = "Southern Connecticut State University"
    SOUTHERN_METHODIST_UNIVERSITY = "Southern Methodist University"
    ST_LAWRENCE_UNIVERSITY = "St. Lawrence University"
    STANFORD_UNIVERSITY = "Stanford University"
    SYRACUSE_UNIVERSITY = "Syracuse University"
    THE_UNIVERSITY_OF_TAMPA = "The University of Tampa"
    TRINITY_COLLEGE = "Trinity College"
    TUFTS_UNIVERSITY = "Tufts University"
    UNION_COLLEGE = "Union College"
    UNITED_STATES_MERCHANT_MARINE_ACADEMY = "United States Merchant Marine Academy"
    UNIVERSITY_COLLEGE_LONDON = "University College London"
    UNIVERSITY_OF_CALIFORNIA_BERKELEY = "University of California, Berkeley"
    UNIVERSITY_OF_CALIFORNIA_LOS_ANGELES = "University of California, Los Angeles"
    UNIVERSITY_OF_CALIFORNIA_SANTA_BARBARA = "University of California, Santa Barbara"
    UNIVERSITY_OF_CALIFORNIA_SANTA_CRUZ = "University of California, Santa Cruz"
    UNIVERSITY_OF_CHICAGO = "University of Chicago"
    UNIVERSITY_OF_COLORADO_BOULDER = "University of Colorado Boulder"
    UNIVERSITY_OF_CONNECTICUT = "University of Connecticut"
    UNIVERSITY_OF_DELAWARE = "University of Delaware"
    UNIVERSITY_OF_MARYLAND = "University of Maryland"
    UNIVERSITY_OF_MASSACHUSETTS_AMHERST = "University of Massachusetts Amherst"
    UNIVERSITY_OF_MIAMI = "University of Miami"
    UNIVERSITY_OF_MICHIGAN = "University of Michigan"
    UNIVERSITY_OF_NEW_HAMPSHIRE = "University of New Hampshire"
    UNIVERSITY_OF_PENNSYLVANIA = "University of Pennsylvania"
    UNIVERSITY_OF_RHODE_ISLAND = "University of Rhode Island"
    UNIVERSITY_OF_RICHMOND = "University of Richmond"
    UNIVERSITY_OF_ROCHESTER = "University of Rochester"
    UNIVERSITY_OF_SOUTHERN_CALIFORNIA = "University of Southern California"
    UNIVERSITY_OF_TORONTO = "University of Toronto"
    UNIVERSITY_OF_VERMONT = "University of Vermont"
    UNIVERSITY_OF_VIRGINIA = "University of Virginia"
    UNIVERSITY_OF_WASHINGTON = "University of Washington"
    UNIVERSITY_OF_WISCONSIN_MADISON = "University of Wisconsin-Madison"
    VANDERBILT_UNIVERSITY = "Vanderbilt University"
    VILLANOVA_UNIVERSITY = "Villanova University"
    WAKE_FOREST_UNIVERSITY = "Wake Forest University"
    WESLEYAN_UNIVERSITY = "Wesleyan University"
    WESTFIELD_STATE_UNIVERSITY = "Westfield State University"
    WHEATON_COLLEGE = "Wheaton College"
    WHITMAN_COLLEGE = "Whitman College"
    WILLIAMS_COLLEGE = "Williams College"
    WORCESTER_POLYTECHNIC_INSTITUTE = "Worcester Polytechnic Institute"
    YALE_UNIVERSITY = "Yale University"

    @staticmethod
    @functools.cache
    def values() -> list[str]:
        return [item for item in UniversityName]
